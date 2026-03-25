import { Router, Request, Response } from 'express';
import * as queries from '../models/queries';

const router = Router();

/** GET /api/vacation-schedules - Get all vacation schedules */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const schedules = await queries.getAllVacationSchedules();
    res.json({ schedules });
  } catch (error) {
    console.error('[vacation-schedules] Error fetching schedules:', error);
    res.status(500).json({ error: 'Failed to fetch vacation schedules' });
  }
});

/** GET /api/vacation-schedules/employee/:employeeId - Get schedule for a specific employee */
router.get('/employee/:employeeId', async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.employeeId as string, 10);
    if (isNaN(employeeId)) {
      res.status(400).json({ error: 'Invalid employee ID' });
      return;
    }
    const schedule = await queries.getVacationScheduleByEmployee(employeeId);
    res.json({ schedule: schedule || null });
  } catch (error) {
    console.error('[vacation-schedules] Error fetching employee schedule:', error);
    res.status(500).json({ error: 'Failed to fetch vacation schedule' });
  }
});

/** POST /api/vacation-schedules - Create a vacation schedule */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { employee_id, period_1_date, period_2_date, notes } = req.body;

    if (!employee_id || !period_1_date) {
      res.status(400).json({ error: 'employee_id and period_1_date are required' });
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(period_1_date)) {
      res.status(400).json({ error: 'Invalid date format for period_1_date. Use YYYY-MM-DD' });
      return;
    }

    if (period_2_date && !/^\d{4}-\d{2}-\d{2}$/.test(period_2_date)) {
      res.status(400).json({ error: 'Invalid date format for period_2_date. Use YYYY-MM-DD' });
      return;
    }

    const employee = await queries.getEmployeeById(employee_id);
    if (!employee) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }

    // Check if a schedule already exists for this employee
    const existing = await queries.getVacationScheduleByEmployee(employee_id);
    if (existing) {
      res.status(409).json({ error: 'A vacation schedule already exists for this employee. Use PUT to update.' });
      return;
    }

    const result = await queries.insertVacationSchedule(
      employee_id,
      period_1_date,
      period_2_date || null,
      notes
    );

    await queries.logAudit('VACATION_SCHEDULE_CREATED', 'vacation_schedule', result.id,
      `${employee.name}: 1º período ${period_1_date}${period_2_date ? `, 2º período ${period_2_date}` : ''}`);

    res.status(201).json({
      success: true,
      id: result.id,
      message: 'Vencimento de férias cadastrado com sucesso',
    });
  } catch (error) {
    console.error('[vacation-schedules] Error creating schedule:', error);
    res.status(500).json({ error: 'Failed to create vacation schedule' });
  }
});

/** PUT /api/vacation-schedules/:id - Update a vacation schedule */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid schedule ID' });
      return;
    }

    const { period_1_date, period_2_date, notes } = req.body;

    if (!period_1_date) {
      res.status(400).json({ error: 'period_1_date is required' });
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(period_1_date)) {
      res.status(400).json({ error: 'Invalid date format for period_1_date. Use YYYY-MM-DD' });
      return;
    }

    if (period_2_date && !/^\d{4}-\d{2}-\d{2}$/.test(period_2_date)) {
      res.status(400).json({ error: 'Invalid date format for period_2_date. Use YYYY-MM-DD' });
      return;
    }

    const updated = await queries.updateVacationSchedule(id, period_1_date, period_2_date || null, notes);
    if (!updated) {
      res.status(404).json({ error: 'Vacation schedule not found' });
      return;
    }

    await queries.logAudit('VACATION_SCHEDULE_UPDATED', 'vacation_schedule', id,
      `1º período ${period_1_date}${period_2_date ? `, 2º período ${period_2_date}` : ''}`);

    res.json({ success: true, message: 'Vencimento de férias atualizado com sucesso' });
  } catch (error) {
    console.error('[vacation-schedules] Error updating schedule:', error);
    res.status(500).json({ error: 'Failed to update vacation schedule' });
  }
});

/** DELETE /api/vacation-schedules/:id - Delete a vacation schedule */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid schedule ID' });
      return;
    }

    const schedule = await queries.getVacationScheduleById(id);
    const deleted = await queries.deleteVacationSchedule(id);
    if (!deleted) {
      res.status(404).json({ error: 'Vacation schedule not found' });
      return;
    }

    const employee = schedule ? await queries.getEmployeeById(schedule.employee_id) : null;
    await queries.logAudit('VACATION_SCHEDULE_DELETED', 'vacation_schedule', id,
      employee ? `${employee.name}` : '');

    res.json({ success: true, message: 'Vencimento de férias removido com sucesso' });
  } catch (error) {
    console.error('[vacation-schedules] Error deleting schedule:', error);
    res.status(500).json({ error: 'Failed to delete vacation schedule' });
  }
});

export default router;
