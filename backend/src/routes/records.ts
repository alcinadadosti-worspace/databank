import { Router, Request, Response } from 'express';
import * as queries from '../models/queries';

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
    const units = await queries.getUnitRecords(date);
    res.json({ units, date });
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
