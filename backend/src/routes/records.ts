import { Router, Request, Response } from 'express';
import * as queries from '../models/queries';

const router = Router();

/** GET /api/records?date=YYYY-MM-DD - Get all records for a date */
router.get('/', (req: Request, res: Response) => {
  try {
    const { date } = req.query;
    if (!date || typeof date !== 'string') {
      res.status(400).json({ error: 'date query parameter required (YYYY-MM-DD)' });
      return;
    }
    const records = queries.getDailyRecordsByDate(date);
    res.json({ records });
  } catch (error) {
    console.error('[records] Error fetching records:', error);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

/** GET /api/records/employee/:employeeId?start=YYYY-MM-DD&end=YYYY-MM-DD */
router.get('/employee/:employeeId', (req: Request, res: Response) => {
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

    const records = queries.getDailyRecordsByEmployeeRange(employeeId, start, end);
    res.json({ records });
  } catch (error) {
    console.error('[records] Error fetching employee records:', error);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

/** GET /api/records/leader/:leaderId?start=YYYY-MM-DD&end=YYYY-MM-DD */
router.get('/leader/:leaderId', (req: Request, res: Response) => {
  try {
    const leaderId = parseInt(req.params.leaderId as string, 10);
    const { start, end } = req.query;

    if (isNaN(leaderId)) {
      res.status(400).json({ error: 'Invalid leader ID' });
      return;
    }
    if (!start || !end || typeof start !== 'string' || typeof end !== 'string') {
      res.status(400).json({ error: 'start and end query parameters required (YYYY-MM-DD)' });
      return;
    }

    const records = queries.getDailyRecordsByLeaderRange(leaderId, start, end);
    res.json({ records });
  } catch (error) {
    console.error('[records] Error fetching leader records:', error);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

/** GET /api/records/all?start=YYYY-MM-DD&end=YYYY-MM-DD (Admin only) */
router.get('/all', (req: Request, res: Response) => {
  try {
    const { start, end } = req.query;
    if (!start || !end || typeof start !== 'string' || typeof end !== 'string') {
      res.status(400).json({ error: 'start and end query parameters required (YYYY-MM-DD)' });
      return;
    }

    const records = queries.getAllRecordsRange(start, end);
    res.json({ records });
  } catch (error) {
    console.error('[records] Error fetching all records:', error);
    res.status(500).json({ error: 'Failed to fetch records' });
  }
});

export default router;
