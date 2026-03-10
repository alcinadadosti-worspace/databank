import { Router, Request, Response } from 'express';
import * as queries from '../models/queries';

const router = Router();

/** GET /api/vacations - Get all vacations */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const vacations = await queries.getAllVacations();
    res.json({ vacations });
  } catch (error) {
    console.error('[vacations] Error fetching vacations:', error);
    res.status(500).json({ error: 'Failed to fetch vacations' });
  }
});

/** GET /api/vacations/active - Get currently active vacations */
router.get('/active', async (req: Request, res: Response) => {
  try {
    const date = req.query.date as string | undefined;
    const vacations = await queries.getActiveVacations(date);
    res.json({ vacations });
  } catch (error) {
    console.error('[vacations] Error fetching active vacations:', error);
    res.status(500).json({ error: 'Failed to fetch active vacations' });
  }
});

/** GET /api/vacations/check/:employeeId - Check if employee is on vacation */
router.get('/check/:employeeId', async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.employeeId as string, 10);
    if (isNaN(employeeId)) {
      res.status(400).json({ error: 'Invalid employee ID' });
      return;
    }

    const date = req.query.date as string | undefined;
    const isOnVacation = await queries.isEmployeeOnVacation(employeeId, date);

    res.json({ employeeId, isOnVacation, date: date || new Date().toISOString().split('T')[0] });
  } catch (error) {
    console.error('[vacations] Error checking vacation status:', error);
    res.status(500).json({ error: 'Failed to check vacation status' });
  }
});

/** GET /api/vacations/employee/:employeeId - Get vacations for a specific employee */
router.get('/employee/:employeeId', async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.employeeId as string, 10);
    if (isNaN(employeeId)) {
      res.status(400).json({ error: 'Invalid employee ID' });
      return;
    }

    const vacations = await queries.getVacationsByEmployee(employeeId);
    res.json({ vacations });
  } catch (error) {
    console.error('[vacations] Error fetching employee vacations:', error);
    res.status(500).json({ error: 'Failed to fetch employee vacations' });
  }
});

/** POST /api/vacations - Create a new vacation */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { employee_id, start_date, end_date, days, notes } = req.body;

    if (!employee_id || !start_date || !end_date || !days) {
      res.status(400).json({ error: 'employee_id, start_date, end_date, and days are required' });
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
      res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      return;
    }

    if (start_date > end_date) {
      res.status(400).json({ error: 'start_date must be before or equal to end_date' });
      return;
    }

    if (typeof days !== 'number' || days < 1) {
      res.status(400).json({ error: 'days must be a positive number' });
      return;
    }

    // Check if employee exists
    const employee = await queries.getEmployeeById(employee_id);
    if (!employee) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }

    const result = await queries.insertVacation(employee_id, start_date, end_date, days, notes);
    await queries.logAudit('VACATION_CREATED', 'vacation', result.id,
      `${employee.name}: ${start_date} a ${end_date} (${days} dias)`);

    res.status(201).json({
      success: true,
      id: result.id,
      message: 'Ferias registradas com sucesso'
    });
  } catch (error) {
    console.error('[vacations] Error creating vacation:', error);
    res.status(500).json({ error: 'Failed to create vacation' });
  }
});

/** PUT /api/vacations/:id - Update a vacation */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid vacation ID' });
      return;
    }

    const { start_date, end_date, days, notes } = req.body;

    if (!start_date || !end_date || !days) {
      res.status(400).json({ error: 'start_date, end_date, and days are required' });
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(start_date) || !/^\d{4}-\d{2}-\d{2}$/.test(end_date)) {
      res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      return;
    }

    if (start_date > end_date) {
      res.status(400).json({ error: 'start_date must be before or equal to end_date' });
      return;
    }

    const updated = await queries.updateVacation(id, start_date, end_date, days, notes);
    if (!updated) {
      res.status(404).json({ error: 'Vacation not found' });
      return;
    }

    await queries.logAudit('VACATION_UPDATED', 'vacation', id, `${start_date} a ${end_date}`);

    res.json({ success: true, message: 'Ferias atualizadas com sucesso' });
  } catch (error) {
    console.error('[vacations] Error updating vacation:', error);
    res.status(500).json({ error: 'Failed to update vacation' });
  }
});

/** DELETE /api/vacations/:id - Delete a vacation */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid vacation ID' });
      return;
    }

    // Get vacation info before deleting for audit log
    const vacation = await queries.getVacationById(id);

    const deleted = await queries.deleteVacation(id);
    if (!deleted) {
      res.status(404).json({ error: 'Vacation not found' });
      return;
    }

    const employee = vacation ? await queries.getEmployeeById(vacation.employee_id) : null;
    await queries.logAudit('VACATION_DELETED', 'vacation', id,
      employee ? `${employee.name}: ${vacation?.start_date} a ${vacation?.end_date}` : '');

    res.json({ success: true, message: 'Ferias removidas com sucesso' });
  } catch (error) {
    console.error('[vacations] Error deleting vacation:', error);
    res.status(500).json({ error: 'Failed to delete vacation' });
  }
});

export default router;
