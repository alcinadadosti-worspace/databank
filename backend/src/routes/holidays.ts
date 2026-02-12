import { Router, Request, Response } from 'express';
import * as queries from '../models/queries';

const router = Router();

/** GET /api/holidays - Get all holidays */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const holidays = await queries.getAllHolidays();
    res.json({ holidays });
  } catch (error) {
    console.error('[holidays] Error fetching holidays:', error);
    res.status(500).json({ error: 'Failed to fetch holidays' });
  }
});

/** GET /api/holidays/year/:year - Get holidays for a specific year */
router.get('/year/:year', async (req: Request, res: Response) => {
  try {
    const year = parseInt(req.params.year, 10);
    if (isNaN(year) || year < 2000 || year > 2100) {
      res.status(400).json({ error: 'Invalid year' });
      return;
    }
    const holidays = await queries.getHolidaysForYear(year);
    res.json({ holidays, year });
  } catch (error) {
    console.error('[holidays] Error fetching holidays for year:', error);
    res.status(500).json({ error: 'Failed to fetch holidays' });
  }
});

/** GET /api/holidays/check/:date - Check if a date is a holiday */
router.get('/check/:date', async (req: Request, res: Response) => {
  try {
    const { date } = req.params;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      return;
    }
    const holiday = await queries.getHolidayForDate(date);
    res.json({
      isHoliday: !!holiday,
      holiday: holiday || null,
    });
  } catch (error) {
    console.error('[holidays] Error checking holiday:', error);
    res.status(500).json({ error: 'Failed to check holiday' });
  }
});

/** POST /api/holidays - Create a new holiday */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { date, name, type, recurring } = req.body;

    if (!date || !name || !type) {
      res.status(400).json({ error: 'date, name, and type are required' });
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      return;
    }

    const validTypes = ['national', 'state', 'municipal', 'company'];
    if (!validTypes.includes(type)) {
      res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` });
      return;
    }

    const result = await queries.insertHoliday(date, name, type, recurring === true);
    await queries.logAudit('HOLIDAY_CREATED', 'holiday', result.id, `${name} - ${date}`);

    res.status(201).json({ success: true, id: result.id, message: 'Feriado criado com sucesso' });
  } catch (error) {
    console.error('[holidays] Error creating holiday:', error);
    res.status(500).json({ error: 'Failed to create holiday' });
  }
});

/** PUT /api/holidays/:id - Update a holiday */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid holiday ID' });
      return;
    }

    const { date, name, type, recurring } = req.body;

    if (!date || !name || !type) {
      res.status(400).json({ error: 'date, name, and type are required' });
      return;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
      return;
    }

    const validTypes = ['national', 'state', 'municipal', 'company'];
    if (!validTypes.includes(type)) {
      res.status(400).json({ error: `type must be one of: ${validTypes.join(', ')}` });
      return;
    }

    const updated = await queries.updateHoliday(id, date, name, type, recurring === true);
    if (!updated) {
      res.status(404).json({ error: 'Holiday not found' });
      return;
    }

    await queries.logAudit('HOLIDAY_UPDATED', 'holiday', id, `${name} - ${date}`);

    res.json({ success: true, message: 'Feriado atualizado com sucesso' });
  } catch (error) {
    console.error('[holidays] Error updating holiday:', error);
    res.status(500).json({ error: 'Failed to update holiday' });
  }
});

/** DELETE /api/holidays/:id - Delete a holiday */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid holiday ID' });
      return;
    }

    // Get holiday info before deleting for audit log
    const holiday = await queries.getHolidayById(id);

    const deleted = await queries.deleteHoliday(id);
    if (!deleted) {
      res.status(404).json({ error: 'Holiday not found' });
      return;
    }

    await queries.logAudit('HOLIDAY_DELETED', 'holiday', id, holiday ? `${holiday.name} - ${holiday.date}` : '');

    res.json({ success: true, message: 'Feriado removido com sucesso' });
  } catch (error) {
    console.error('[holidays] Error deleting holiday:', error);
    res.status(500).json({ error: 'Failed to delete holiday' });
  }
});

export default router;
