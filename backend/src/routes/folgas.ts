import { Router, Request, Response } from 'express';
import * as queries from '../models/queries';

const router = Router();

/** GET /api/folgas - All folgas (admin RH) */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const folgas = await queries.getAllFolgas();
    res.json({ folgas });
  } catch (error) {
    console.error('[folgas] Error fetching folgas:', error);
    res.status(500).json({ error: 'Failed to fetch folgas' });
  }
});

/** GET /api/folgas/leader/:leaderId - Folgas scoped to a manager's team */
router.get('/leader/:leaderId', async (req: Request, res: Response) => {
  try {
    const leaderId = parseInt(req.params.leaderId as string, 10);
    if (isNaN(leaderId)) {
      res.status(400).json({ error: 'Invalid leader ID' });
      return;
    }
    const folgas = await queries.getFolgasByLeader(leaderId);
    res.json({ folgas });
  } catch (error) {
    console.error('[folgas] Error fetching leader folgas:', error);
    res.status(500).json({ error: 'Failed to fetch folgas' });
  }
});

/** GET /api/folgas/employee/:employeeId - Folgas for a specific employee */
router.get('/employee/:employeeId', async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.employeeId as string, 10);
    if (isNaN(employeeId)) {
      res.status(400).json({ error: 'Invalid employee ID' });
      return;
    }
    const folgas = await queries.getFolgasByEmployee(employeeId);
    res.json({ folgas });
  } catch (error) {
    console.error('[folgas] Error fetching employee folgas:', error);
    res.status(500).json({ error: 'Failed to fetch folgas' });
  }
});

/** POST /api/folgas/range - Create one folga per working day in a date range */
router.post('/range', async (req: Request, res: Response) => {
  try {
    const { employee_id, leader_id, start_date, end_date, type, hours_off, notes } = req.body;

    if (!employee_id || !leader_id || !start_date || !end_date || !type) {
      res.status(400).json({ error: 'employee_id, leader_id, start_date, end_date, and type are required' });
      return;
    }

    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRe.test(start_date) || !dateRe.test(end_date)) {
      res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      return;
    }

    if (start_date > end_date) {
      res.status(400).json({ error: 'start_date must be before or equal to end_date' });
      return;
    }

    // Limit range to 60 days to prevent abuse
    const msPerDay = 24 * 60 * 60 * 1000;
    const rangeDays = (new Date(end_date).getTime() - new Date(start_date).getTime()) / msPerDay + 1;
    if (rangeDays > 60) {
      res.status(400).json({ error: 'Date range cannot exceed 60 days' });
      return;
    }

    if (type !== 'integral' && type !== 'partial') {
      res.status(400).json({ error: 'type must be "integral" or "partial"' });
      return;
    }

    const employee = await queries.getEmployeeById(employee_id);
    if (!employee) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }

    // Build list of all dates in range
    const dates: string[] = [];
    const cursor = new Date(start_date + 'T12:00:00Z');
    const last = new Date(end_date + 'T12:00:00Z');
    while (cursor <= last) {
      dates.push(cursor.toISOString().split('T')[0]);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    const created: string[] = [];
    const skipped: { date: string; reason: string }[] = [];

    for (const date of dates) {
      // Skip Sundays and holidays
      const working = await queries.isWorkingDayAsync(date);
      if (!working) {
        skipped.push({ date, reason: 'dia não útil' });
        continue;
      }

      // Validate hours_off per day (Saturday vs weekday)
      const isSaturday = new Date(date + 'T12:00:00Z').getUTCDay() === 6;
      const maxHoursOff = isSaturday ? 4 : 8;
      const resolvedHoursOff = type === 'integral' ? maxHoursOff : (typeof hours_off === 'number' ? hours_off : 0);

      if (type === 'partial' && (resolvedHoursOff < 1 || resolvedHoursOff >= maxHoursOff)) {
        skipped.push({ date, reason: `horas inválidas para ${isSaturday ? 'sábado' : 'dia útil'}` });
        continue;
      }

      // Skip if already has a folga
      const existing = await queries.getEmployeesOnFolga(date);
      if (existing.has(employee_id)) {
        skipped.push({ date, reason: 'já possui folga' });
        continue;
      }

      // Skip if on vacation
      const onVacation = await queries.isEmployeeOnVacation(employee_id, date);
      if (onVacation) {
        skipped.push({ date, reason: 'em férias' });
        continue;
      }

      await queries.insertFolga(employee_id, leader_id, date, type, resolvedHoursOff, notes);
      created.push(date);
    }

    await queries.logAudit('FOLGA_RANGE_CREATED', 'employee', employee_id,
      `${employee.name}: ${start_date} a ${end_date} — ${created.length} dias criados`);

    res.status(201).json({
      success: true,
      created: created.length,
      skipped: skipped.length,
      skipped_dates: skipped,
      message: `${created.length} folga(s) registrada(s)${skipped.length > 0 ? `, ${skipped.length} dia(s) ignorado(s)` : ''}`,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[folgas] Error creating folga range:', msg, error);
    res.status(500).json({ error: 'Failed to create folga range', detail: msg });
  }
});

/** POST /api/folgas - Create a folga */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { employee_id, leader_id, date, type, hours_off, notes } = req.body;

    if (!employee_id || !leader_id || !date || !type) {
      res.status(400).json({ error: 'employee_id, leader_id, date, and type are required' });
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      return;
    }

    if (type !== 'integral' && type !== 'partial') {
      res.status(400).json({ error: 'type must be "integral" or "partial"' });
      return;
    }

    // Determine and validate hours_off
    const isSaturday = new Date(date + 'T12:00:00Z').getUTCDay() === 6;
    const maxHoursOff = isSaturday ? 4 : 8;

    const resolvedHoursOff = type === 'integral' ? maxHoursOff : (typeof hours_off === 'number' ? hours_off : 0);

    if (type === 'partial' && (resolvedHoursOff < 1 || resolvedHoursOff >= maxHoursOff)) {
      res.status(400).json({
        error: `hours_off must be between 1 and ${maxHoursOff - 1} for partial folga on this day`,
      });
      return;
    }

    // Verify employee exists
    const employee = await queries.getEmployeeById(employee_id);
    if (!employee) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }

    // Prevent duplicate folga on same day
    const existing = await queries.getEmployeesOnFolga(date);
    if (existing.has(employee_id)) {
      res.status(409).json({ error: 'Employee already has a folga scheduled for this date' });
      return;
    }

    // Prevent folga during vacation
    const onVacation = await queries.isEmployeeOnVacation(employee_id, date);
    if (onVacation) {
      res.status(409).json({ error: 'Employee is on vacation on this date' });
      return;
    }

    const result = await queries.insertFolga(
      employee_id, leader_id, date, type, resolvedHoursOff, notes
    );
    await queries.logAudit('FOLGA_CREATED', 'folga', result.id,
      `${employee.name}: ${date} — ${type === 'integral' ? 'Integral' : `Parcial (${resolvedHoursOff}h)`}`);

    res.status(201).json({ success: true, id: result.id, message: 'Folga registrada com sucesso' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error('[folgas] Error creating folga:', msg, error);
    res.status(500).json({ error: 'Failed to create folga', detail: msg });
  }
});

/** PUT /api/folgas/:id - Update a folga */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid folga ID' });
      return;
    }

    const { date, type, hours_off, notes } = req.body;

    if (!date || !type) {
      res.status(400).json({ error: 'date and type are required' });
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      return;
    }

    if (type !== 'integral' && type !== 'partial') {
      res.status(400).json({ error: 'type must be "integral" or "partial"' });
      return;
    }

    const isSaturday = new Date(date + 'T12:00:00Z').getUTCDay() === 6;
    const maxHoursOff = isSaturday ? 4 : 8;
    const resolvedHoursOff = type === 'integral' ? maxHoursOff : (typeof hours_off === 'number' ? hours_off : 0);

    if (type === 'partial' && (resolvedHoursOff < 1 || resolvedHoursOff >= maxHoursOff)) {
      res.status(400).json({
        error: `hours_off must be between 1 and ${maxHoursOff - 1} for partial folga on this day`,
      });
      return;
    }

    const updated = await queries.updateFolga(id, date, type, resolvedHoursOff, notes);
    if (!updated) {
      res.status(404).json({ error: 'Folga not found' });
      return;
    }

    await queries.logAudit('FOLGA_UPDATED', 'folga', id,
      `${date} — ${type === 'integral' ? 'Integral' : `Parcial (${resolvedHoursOff}h)`}`);

    res.json({ success: true, message: 'Folga atualizada com sucesso' });
  } catch (error) {
    console.error('[folgas] Error updating folga:', error);
    res.status(500).json({ error: 'Failed to update folga' });
  }
});

/** DELETE /api/folgas/:id - Delete a folga */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid folga ID' });
      return;
    }

    const folga = await queries.getFolgaById(id);
    const deleted = await queries.deleteFolga(id);
    if (!deleted) {
      res.status(404).json({ error: 'Folga not found' });
      return;
    }

    const employee = folga ? await queries.getEmployeeById(folga.employee_id) : null;
    await queries.logAudit('FOLGA_DELETED', 'folga', id,
      employee ? `${employee.name}: ${folga?.date}` : '');

    res.json({ success: true, message: 'Folga removida com sucesso' });
  } catch (error) {
    console.error('[folgas] Error deleting folga:', error);
    res.status(500).json({ error: 'Failed to delete folga' });
  }
});

export default router;
