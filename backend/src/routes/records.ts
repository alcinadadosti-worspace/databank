import { Router, Request, Response } from 'express';
import * as queries from '../models/queries';
import { calculateDailyHoursForEmployee } from '../services/hours-calculator';
import { requireAuth, type AuthenticatedRequest } from '../middleware/auth';

const router = Router();

/** GET /api/records?date=YYYY-MM-DD - Get all records for a date */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { date } = req.query;
    if (!date || typeof date !== 'string') {
      res.status(400).json({ error: 'date query parameter required (YYYY-MM-DD)' });
      return;
    }
    const records = await queries.getDailyRecordsByDate(date);
    res.json({ records });
  } catch (error) {
    console.error('[records] Error fetching records:', error);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

/** GET /api/records/units?date=YYYY-MM-DD - Unit operation overview */
router.get('/units', async (req: Request, res: Response) => {
  try {
    const date = (req.query.date as string) || new Date().toISOString().split('T')[0];
    const [units, isHoliday] = await Promise.all([
      queries.getUnitRecords(date),
      queries.isHolidayAsync(date),
    ]);
    res.json({ units, date, is_holiday: isHoliday });
  } catch (error) {
    console.error('[records] Error fetching unit records:', error);
    res.status(500).json({ error: 'Failed to fetch unit records' });
  }
});

/** GET /api/records/employee/:employeeId?start=YYYY-MM-DD&end=YYYY-MM-DD */
router.get('/employee/:employeeId', async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.employeeId as string, 10);
    const { start, end } = req.query;

    if (isNaN(employeeId)) {
      res.status(400).json({ error: 'Invalid employee ID' });
      return;
    }
    if (!start || !end || typeof start !== 'string' || typeof end !== 'string') {
      res.status(400).json({ error: 'start and end query parameters required (YYYY-MM-DD)' });
      return;
    }

    const records = await queries.getDailyRecordsByEmployeeRange(employeeId, start, end);
    res.json({ records });
  } catch (error) {
    console.error('[records] Error fetching employee records:', error);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

/** GET /api/records/leader/:leaderId?start=YYYY-MM-DD&end=YYYY-MM-DD&limit=100&offset=0 */
router.get('/leader/:leaderId', async (req: Request, res: Response) => {
  try {
    const leaderId = parseInt(req.params.leaderId as string, 10);
    const { start, end, limit, offset } = req.query;

    if (isNaN(leaderId)) {
      res.status(400).json({ error: 'Invalid leader ID' });
      return;
    }
    if (!start || !end || typeof start !== 'string' || typeof end !== 'string') {
      res.status(400).json({ error: 'start and end query parameters required (YYYY-MM-DD)' });
      return;
    }

    // Support optional pagination
    const paginationOptions = limit && offset !== undefined
      ? { limit: parseInt(limit as string, 10), offset: parseInt(offset as string, 10) }
      : undefined;

    const result = await queries.getDailyRecordsByLeaderRange(leaderId, start, end, paginationOptions);

    // Return consistent response format
    if (paginationOptions && 'data' in result) {
      res.json({
        records: result.data,
        pagination: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
          hasMore: result.hasMore,
        },
      });
    } else {
      res.json({ records: result });
    }
  } catch (error) {
    console.error('[records] Error fetching leader records:', error);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

/** PUT /api/records/leader/:leaderId/record/:recordId - Manager edits punches of their own team member */
router.put('/leader/:leaderId/record/:recordId', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const leaderId = parseInt(req.params.leaderId as string, 10);
    const recordId = parseInt(req.params.recordId as string, 10);
    if (isNaN(leaderId) || isNaN(recordId)) {
      res.status(400).json({ error: 'Invalid leader or record ID' });
      return;
    }

    // Manager token must match the leader in the URL (admins can edit any team)
    if (req.user!.role !== 'admin' && req.user!.id !== leaderId) {
      res.status(403).json({ error: 'Acesso negado. Você só pode editar registros da sua equipe' });
      return;
    }

    const { punch_1, punch_2, punch_3, punch_4, editedBy, reason } = req.body;

    // Validate time format (HH:MM or null)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    const punches = [punch_1, punch_2, punch_3, punch_4];
    for (const p of punches) {
      if (p !== null && p !== '' && !timeRegex.test(p)) {
        res.status(400).json({ error: `Invalid time format: ${p}. Use HH:MM` });
        return;
      }
    }

    const existingRecord = await queries.getDailyRecordById(recordId);
    if (!existingRecord) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }

    // Same membership rule as the team listing (direct reports + secondary approvals)
    const employee = await queries.getEmployeeById(existingRecord.employee_id);
    if (!employee || (employee.leader_id !== leaderId && employee.secondary_approver_id !== leaderId)) {
      res.status(403).json({ error: 'Colaborador não pertence à sua equipe' });
      return;
    }

    // Recalculate hours with new punches
    const punchSet = {
      punch1: punch_1 || null,
      punch2: punch_2 || null,
      punch3: punch_3 || null,
      punch4: punch_4 || null,
    };

    const calcResult = calculateDailyHoursForEmployee(punchSet, existingRecord.date, employee);

    // Build old values for audit
    const oldValues = {
      punch_1: existingRecord.punch_1,
      punch_2: existingRecord.punch_2,
      punch_3: existingRecord.punch_3,
      punch_4: existingRecord.punch_4,
    };

    const updated = await queries.updateDailyRecordPunches(
      recordId,
      punch_1 || null,
      punch_2 || null,
      punch_3 || null,
      punch_4 || null,
      calcResult?.totalWorkedMinutes ?? null,
      calcResult?.differenceMinutes ?? null,
      calcResult?.classification ?? null
    );

    if (!updated) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }

    await queries.logAudit('MANUAL_PUNCH_EDIT', 'daily_record', recordId,
      JSON.stringify({
        editedBy: editedBy || req.user!.name || 'gestor',
        editorRole: 'manager',
        leaderId,
        reason: reason || 'Correção manual',
        date: existingRecord.date,
        employeeId: existingRecord.employee_id,
        oldValues,
        newValues: { punch_1, punch_2, punch_3, punch_4 },
      })
    );

    res.json({
      success: true,
      message: 'Registro atualizado com sucesso',
      record: {
        id: recordId,
        punch_1: punch_1 || null,
        punch_2: punch_2 || null,
        punch_3: punch_3 || null,
        punch_4: punch_4 || null,
        total_worked_minutes: calcResult?.totalWorkedMinutes ?? null,
        difference_minutes: calcResult?.differenceMinutes ?? null,
        classification: calcResult?.classification ?? null,
      },
    });
  } catch (error) {
    console.error('[records] Error editing leader record:', error);
    res.status(500).json({ error: 'Failed to edit record' });
  }
});

/** PUT /api/records/leader/:leaderId/employee/:employeeId/day/:date
 *  Manager fills in punches for a team member's day — creates the daily record
 *  when the employee has no record at all (e.g. forgot to punch the whole day). */
router.put('/leader/:leaderId/employee/:employeeId/day/:date', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const leaderId = parseInt(req.params.leaderId as string, 10);
    const employeeId = parseInt(req.params.employeeId as string, 10);
    const date = req.params.date as string;

    if (isNaN(leaderId) || isNaN(employeeId)) {
      res.status(400).json({ error: 'Invalid leader or employee ID' });
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'Invalid date. Use YYYY-MM-DD' });
      return;
    }

    // Manager token must match the leader in the URL (admins can edit any team)
    if (req.user!.role !== 'admin' && req.user!.id !== leaderId) {
      res.status(403).json({ error: 'Acesso negado. Você só pode editar registros da sua equipe' });
      return;
    }

    const { punch_1, punch_2, punch_3, punch_4, editedBy, reason } = req.body;

    // Validate time format (HH:MM or null)
    const timeRegex = /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/;
    const punches = [punch_1, punch_2, punch_3, punch_4];
    for (const p of punches) {
      if (p !== null && p !== undefined && p !== '' && !timeRegex.test(p)) {
        res.status(400).json({ error: `Invalid time format: ${p}. Use HH:MM` });
        return;
      }
    }
    if (!punch_1 && !punch_2 && !punch_3 && !punch_4) {
      res.status(400).json({ error: 'Informe pelo menos um horário' });
      return;
    }

    // Same membership rule as the team listing (direct reports + secondary approvals)
    const employee = await queries.getEmployeeById(employeeId);
    if (!employee || (employee.leader_id !== leaderId && employee.secondary_approver_id !== leaderId)) {
      res.status(403).json({ error: 'Colaborador não pertence à sua equipe' });
      return;
    }

    const punchSet = {
      punch1: punch_1 || null,
      punch2: punch_2 || null,
      punch3: punch_3 || null,
      punch4: punch_4 || null,
    };

    const calcResult = calculateDailyHoursForEmployee(punchSet, date, employee);

    // Existing record (if any) for the audit trail
    const existingRecord = await queries.getDailyRecord(employeeId, date);
    const oldValues = {
      punch_1: existingRecord?.punch_1 ?? null,
      punch_2: existingRecord?.punch_2 ?? null,
      punch_3: existingRecord?.punch_3 ?? null,
      punch_4: existingRecord?.punch_4 ?? null,
    };

    const recordId = await queries.upsertManualDailyRecord(
      employeeId,
      date,
      punch_1 || null,
      punch_2 || null,
      punch_3 || null,
      punch_4 || null,
      calcResult?.totalWorkedMinutes ?? null,
      calcResult?.differenceMinutes ?? null,
      calcResult?.classification ?? null
    );

    await queries.logAudit('MANUAL_PUNCH_EDIT', 'daily_record', recordId,
      JSON.stringify({
        editedBy: editedBy || req.user!.name || 'gestor',
        editorRole: 'manager',
        leaderId,
        reason: reason || 'Lançamento manual de ponto',
        date,
        employeeId,
        createdRecord: !existingRecord,
        oldValues,
        newValues: { punch_1, punch_2, punch_3, punch_4 },
      })
    );

    res.json({
      success: true,
      message: existingRecord ? 'Registro atualizado com sucesso' : 'Registro criado com sucesso',
      record: {
        id: recordId,
        punch_1: punch_1 || null,
        punch_2: punch_2 || null,
        punch_3: punch_3 || null,
        punch_4: punch_4 || null,
        total_worked_minutes: calcResult?.totalWorkedMinutes ?? null,
        difference_minutes: calcResult?.differenceMinutes ?? null,
        classification: calcResult?.classification ?? null,
      },
    });
  } catch (error) {
    console.error('[records] Error fixing day record:', error);
    res.status(500).json({ error: 'Failed to fix day record' });
  }
});

/** GET /api/records/no-punch-decisions?start=YYYY-MM-DD&end=YYYY-MM-DD (Admin only) */
router.get('/no-punch-decisions', async (req: Request, res: Response) => {
  try {
    const { start, end } = req.query;
    if (!start || !end || typeof start !== 'string' || typeof end !== 'string') {
      res.status(400).json({ error: 'start and end query parameters required (YYYY-MM-DD)' });
      return;
    }
    const records = await queries.getNoRecordDecisionsRange(start, end);
    res.json({ records });
  } catch (error) {
    console.error('[records] Error fetching no-punch decisions:', error);
    res.status(500).json({ error: 'Failed to fetch no-punch decisions' });
  }
});

/** GET /api/records/all?start=YYYY-MM-DD&end=YYYY-MM-DD&limit=100&offset=0 (Admin only) */
router.get('/all', async (req: Request, res: Response) => {
  try {
    const { start, end, limit, offset } = req.query;
    if (!start || !end || typeof start !== 'string' || typeof end !== 'string') {
      res.status(400).json({ error: 'start and end query parameters required (YYYY-MM-DD)' });
      return;
    }

    // Support optional pagination
    const paginationOptions = limit && offset !== undefined
      ? { limit: parseInt(limit as string, 10), offset: parseInt(offset as string, 10) }
      : undefined;

    const result = await queries.getAllRecordsRange(start, end, paginationOptions);

    // Return consistent response format
    if (paginationOptions && 'data' in result) {
      res.json({
        records: result.data,
        pagination: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
          hasMore: result.hasMore,
        },
      });
    } else {
      res.json({ records: result });
    }
  } catch (error) {
    console.error('[records] Error fetching all records:', error);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

export default router;
