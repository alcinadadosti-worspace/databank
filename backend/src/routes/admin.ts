import { Router, Request, Response } from 'express';
import * as queries from '../models/queries';
import { syncPunches } from '../jobs/sync-punches';
import { sendEmployeeAlert, sendManagerDailySummary, getSlackApp } from '../slack/bot';
import { calculateDailyHours } from '../services/hours-calculator';

const router = Router();

/** GET /api/admin/audit-logs?limit=100&offset=0 */
router.get('/audit-logs', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 100;
    const offset = parseInt(req.query.offset as string, 10) || 0;
    const logs = await queries.getAuditLogs(limit, offset);
    res.json({ logs });
  } catch (error) {
    console.error('[admin] Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

/** GET /api/admin/export?start=YYYY-MM-DD&end=YYYY-MM-DD - Export records as CSV */
router.get('/export', async (req: Request, res: Response) => {
  try {
    const { start, end } = req.query;
    if (!start || !end || typeof start !== 'string' || typeof end !== 'string') {
      res.status(400).json({ error: 'start and end parameters required' });
      return;
    }

    const records = await queries.getAllRecordsRange(start, end);

    const csvHeader = 'Data,Colaborador,Líder,Entrada,Saída Almoço,Retorno Almoço,Saída,Total(min),Diferença(min),Classificação,Justificativa\n';
    const csvRows = records.map((r: any) =>
      [
        r.date,
        `"${r.employee_name}"`,
        `"${r.leader_name}"`,
        r.punch_1 || '',
        r.punch_2 || '',
        r.punch_3 || '',
        r.punch_4 || '',
        r.total_worked_minutes ?? '',
        r.difference_minutes ?? '',
        r.classification || '',
        `"${r.justification_reason || ''}"`,
      ].join(',')
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=banco-horas-${start}-${end}.csv`);
    res.send('\uFEFF' + csvHeader + csvRows);
  } catch (error) {
    console.error('[admin] Error exporting:', error);
    res.status(500).json({ error: 'Failed to export' });
  }
});

/** GET /api/admin/dashboard - Overview stats */
router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    const stats = await queries.getDashboardStats();
    res.json(stats);
  } catch (error) {
    console.error('[admin] Error fetching dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

/** POST /api/admin/leader-slack - Set a leader's Slack ID */
router.post('/leader-slack', async (req: Request, res: Response) => {
  try {
    const { leaderId, slackId } = req.body;
    if (!leaderId || !slackId) {
      res.status(400).json({ error: 'leaderId and slackId required' });
      return;
    }
    await queries.updateLeaderSlackId(Number(leaderId), slackId);
    res.json({ success: true, message: `Leader ${leaderId} slack_id set to ${slackId}` });
  } catch (error) {
    console.error('[admin] Error updating leader:', error);
    res.status(500).json({ error: 'Failed to update leader' });
  }
});

/** POST /api/admin/resync?date=YYYY-MM-DD - Re-sync punches for a specific date */
router.post('/resync', async (req: Request, res: Response) => {
  try {
    const date = (req.query.date as string) || (req.body && req.body.date);
    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'date parameter required (YYYY-MM-DD)' });
      return;
    }
    console.log(`[admin] Manual resync requested for ${date}`);
    await syncPunches(date);
    res.json({ success: true, message: `Resync completed for ${date}` });
  } catch (error) {
    console.error('[admin] Error resyncing:', error);
    res.status(500).json({ error: 'Failed to resync' });
  }
});

// In-memory sync status tracking
interface SyncStatus {
  id: string;
  status: 'running' | 'completed' | 'error';
  startDate: string;
  endDate: string;
  totalDays: number;
  synced: number;
  errors: number;
  currentDate?: string;
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
}

const syncJobs = new Map<string, SyncStatus>();

/** POST /api/admin/sync-range - Start sync punches for a date range (runs in background) */
router.post('/sync-range', async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, skipNotifications } = req.body;

    if (!startDate || !endDate) {
      res.status(400).json({ error: 'startDate and endDate are required' });
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      res.status(400).json({ error: 'Dates must be in YYYY-MM-DD format' });
      return;
    }

    const start = new Date(startDate);
    const end = new Date(endDate);

    if (start > end) {
      res.status(400).json({ error: 'startDate must be before or equal to endDate' });
      return;
    }

    const diffTime = end.getTime() - start.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    if (diffDays > 90) {
      res.status(400).json({ error: 'Maximum range is 90 days' });
      return;
    }

    // Generate unique job ID
    const jobId = `sync_${Date.now()}`;

    // Create initial status
    const status: SyncStatus = {
      id: jobId,
      status: 'running',
      startDate,
      endDate,
      totalDays: diffDays,
      synced: 0,
      errors: 0,
      startedAt: new Date().toISOString(),
    };
    syncJobs.set(jobId, status);

    console.log(`[admin] Sync range started: ${startDate} to ${endDate} (${diffDays} days) - Job ${jobId}`);

    // Return immediately with job ID
    res.json({
      success: true,
      message: 'Sync started in background',
      jobId,
      totalDays: diffDays,
    });

    // Run sync in background (after response is sent)
    setImmediate(async () => {
      const current = new Date(start);

      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        status.currentDate = dateStr;

        try {
          await syncPunches(dateStr, { skipNotifications: !!skipNotifications });
          status.synced++;
          console.log(`[admin] Synced ${dateStr} (${status.synced}/${diffDays})`);
        } catch (err) {
          status.errors++;
          console.error(`[admin] Error syncing ${dateStr}:`, err);
        }

        current.setDate(current.getDate() + 1);
      }

      status.status = 'completed';
      status.completedAt = new Date().toISOString();

      await queries.logAudit('SYNC_RANGE', 'admin', undefined,
        `Synced range ${startDate} to ${endDate}: ${status.synced} days synced, ${status.errors} errors`);

      console.log(`[admin] Sync completed: ${status.synced} days synced, ${status.errors} errors`);

      // Clean up old jobs after 1 hour
      setTimeout(() => syncJobs.delete(jobId), 60 * 60 * 1000);
    });
  } catch (error) {
    console.error('[admin] Error starting sync-range:', error);
    res.status(500).json({ error: 'Failed to start sync' });
  }
});

/** GET /api/admin/sync-status/:jobId - Get status of a sync job */
router.get('/sync-status/:jobId', (req: Request, res: Response) => {
  const jobId = req.params.jobId as string;
  const status = syncJobs.get(jobId);

  if (!status) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  res.json(status);
});

/** POST /api/admin/employee-schedule - Configure employee work schedule */
router.post('/employee-schedule', async (req: Request, res: Response) => {
  try {
    const { employeeId, reducedSchedule, expectedMinutes } = req.body;

    if (!employeeId || typeof reducedSchedule !== 'boolean' || !expectedMinutes) {
      res.status(400).json({ error: 'employeeId, reducedSchedule (boolean), and expectedMinutes are required' });
      return;
    }

    await queries.setApprentice(Number(employeeId), reducedSchedule, Number(expectedMinutes));

    await queries.logAudit('EMPLOYEE_SCHEDULE_UPDATE', 'employee', employeeId,
      `Set reducedSchedule=${reducedSchedule}, expectedMinutes=${expectedMinutes}`);

    res.json({
      success: true,
      message: `Employee ${employeeId} schedule updated: ${expectedMinutes} min/day, reducedSchedule=${reducedSchedule}`
    });
  } catch (error) {
    console.error('[admin] Error updating employee schedule:', error);
    res.status(500).json({ error: 'Failed to update employee schedule' });
  }
});

/** GET /api/admin/employees - List all employees with their settings */
router.get('/employees', async (_req: Request, res: Response) => {
  try {
    const employees = await queries.getAllEmployees();
    res.json({ employees });
  } catch (error) {
    console.error('[admin] Error fetching employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

/** DELETE /api/admin/employee/:id - Delete an employee */
router.delete('/employee/:id', async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.id as string, 10);
    if (isNaN(employeeId)) {
      res.status(400).json({ error: 'Invalid employee ID' });
      return;
    }

    await queries.deleteEmployee(employeeId);
    await queries.logAudit('EMPLOYEE_DELETED', 'employee', employeeId, `Employee ${employeeId} deleted`);

    res.json({ success: true, message: `Employee ${employeeId} deleted` });
  } catch (error) {
    console.error('[admin] Error deleting employee:', error);
    res.status(500).json({ error: 'Failed to delete employee' });
  }
});

/** PUT /api/admin/record/:id - Manually edit a daily record's punches */
router.put('/record/:id', async (req: Request, res: Response) => {
  try {
    const recordId = parseInt(req.params.id as string, 10);
    if (isNaN(recordId)) {
      res.status(400).json({ error: 'Invalid record ID' });
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

    // Get the existing record
    const existingRecord = await queries.getDailyRecordById(recordId);
    if (!existingRecord) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }

    // Get employee info for recalculation
    const employee = await queries.getEmployeeById(existingRecord.employee_id);

    // Recalculate hours with new punches
    const punchSet = {
      punch1: punch_1 || null,
      punch2: punch_2 || null,
      punch3: punch_3 || null,
      punch4: punch_4 || null,
    };

    const calcResult = calculateDailyHours(punchSet, {
      date: existingRecord.date,
      isApprentice: employee?.is_apprentice ?? false,
      expectedMinutes: employee?.expected_daily_minutes,
    });

    // Build old values for audit
    const oldValues = {
      punch_1: existingRecord.punch_1,
      punch_2: existingRecord.punch_2,
      punch_3: existingRecord.punch_3,
      punch_4: existingRecord.punch_4,
    };

    // Update the record
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

    // Log the manual edit with details
    await queries.logAudit('MANUAL_PUNCH_EDIT', 'daily_record', recordId,
      JSON.stringify({
        editedBy: editedBy || 'admin',
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
    console.error('[admin] Error editing record:', error);
    res.status(500).json({ error: 'Failed to edit record' });
  }
});

/** POST /api/admin/test-slack - Test Slack bot connection */
router.post('/test-slack', async (req: Request, res: Response) => {
  try {
    const app = getSlackApp();
    if (!app) {
      res.status(400).json({
        success: false,
        error: 'Slack não configurado. Verifique SLACK_BOT_TOKEN, SLACK_APP_TOKEN e SLACK_SIGNING_SECRET no .env'
      });
      return;
    }

    const { type = 'employee' } = req.body;
    const today = new Date().toISOString().split('T')[0];

    if (type === 'employee') {
      // Send test employee alert
      await sendEmployeeAlert(
        null, // will use SLACK_TEST_USER_ID
        'Colaborador Teste',
        today,
        450, // 7h30 worked
        -30, // 30min late
        'late',
        99999 // fake record ID
      );
      res.json({
        success: true,
        message: 'Alerta de teste (atraso) enviado! Verifique seu Slack.'
      });
    } else if (type === 'manager') {
      // Send test manager summary
      await sendManagerDailySummary(
        null, // will use SLACK_TEST_USER_ID
        'Gestor Teste',
        today,
        [
          { employee_name: 'Maria Silva', classification: 'late', difference_minutes: -25, justification_reason: 'Trânsito' },
          { employee_name: 'João Santos', classification: 'overtime', difference_minutes: 45, justification_reason: null },
          { employee_name: 'Ana Costa', classification: 'late', difference_minutes: -15, justification_reason: 'Atestado médico' },
        ]
      );
      res.json({
        success: true,
        message: 'Resumo de gestor de teste enviado! Verifique seu Slack.'
      });
    } else {
      res.status(400).json({ error: 'type must be "employee" or "manager"' });
    }
  } catch (error) {
    console.error('[admin] Error testing Slack:', error);
    res.status(500).json({ error: 'Falha ao enviar teste: ' + (error as Error).message });
  }
});

/** POST /api/admin/test-reminder - Test punch reminder */
router.post('/test-reminder', async (req: Request, res: Response) => {
  try {
    const { sendPunchReminder } = await import('../slack/bot');
    const app = getSlackApp();
    if (!app) {
      res.status(400).json({
        success: false,
        error: 'Slack nao configurado.'
      });
      return;
    }

    const { type = 'entry' } = req.body;

    if (type === 'entry') {
      await sendPunchReminder(null, 'Colaborador Teste', 'entry', 10);
      res.json({
        success: true,
        message: 'Lembrete de entrada enviado! Verifique seu Slack.'
      });
    } else if (type === 'lunch_return') {
      await sendPunchReminder(null, 'Colaborador Teste', 'lunch_return', 10);
      res.json({
        success: true,
        message: 'Lembrete de retorno do almoco enviado! Verifique seu Slack.'
      });
    } else if (type === 'exit') {
      await sendPunchReminder(null, 'Colaborador Teste', 'exit', 10);
      res.json({
        success: true,
        message: 'Lembrete de saida enviado! Verifique seu Slack.'
      });
    } else {
      res.status(400).json({ error: 'type must be "entry", "lunch_return", or "exit"' });
    }
  } catch (error) {
    console.error('[admin] Error testing reminder:', error);
    res.status(500).json({ error: 'Falha ao enviar teste: ' + (error as Error).message });
  }
});

export default router;
