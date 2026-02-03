import { Router, Request, Response } from 'express';
import * as queries from '../models/queries';

const router = Router();

/** GET /api/employees - List all employees */
router.get('/', (_req: Request, res: Response) => {
  try {
    const employees = queries.getAllEmployees();
    res.json({ employees });
  } catch (error) {
    console.error('[employees] Error fetching employees:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

/** GET /api/employees/leader/:leaderId - Get employees by leader */
router.get('/leader/:leaderId', (req: Request, res: Response) => {
  try {
    const leaderId = parseInt(req.params.leaderId as string, 10);
    if (isNaN(leaderId)) {
      res.status(400).json({ error: 'Invalid leader ID' });
      return;
    }
    const employees = queries.getEmployeesByLeaderId(leaderId);
    res.json({ employees });
  } catch (error) {
    console.error('[employees] Error fetching by leader:', error);
    res.status(500).json({ error: 'Failed to fetch employees' });
  }
});

/** GET /api/employees/:id - Get single employee */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid employee ID' });
      return;
    }
    const employee = queries.getEmployeeById(id);
    if (!employee) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }
    res.json({ employee });
  } catch (error) {
    console.error('[employees] Error fetching employee:', error);
    res.status(500).json({ error: 'Failed to fetch employee' });
  }
});

export default router;
