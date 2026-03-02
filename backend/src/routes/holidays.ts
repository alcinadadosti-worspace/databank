import { Router, Request, Response } from 'express';
import * as queries from '../models/queries';
import { syncHolidaysForYear, syncUpcomingHolidays, getAvailableYears } from '../services/holiday-sync';

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
    const year = parseInt(req.params.year as string, 10);
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
    const date = req.params.date as string;
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
    const id = parseInt(req.params.id as string, 10);
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
    const id = parseInt(req.params.id as string, 10);
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

/** POST /api/holidays/sync - Sync holidays from public API (current + next year) */
router.post('/sync', async (_req: Request, res: Response) => {
  try {
    console.log('[holidays] Starting holiday sync...');
    const results = await syncUpcomingHolidays();

    const totalCreated = results.reduce((sum, r) => sum + r.created, 0);
    const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);
    const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);

    res.json({
      success: true,
      message: `Sincronizacao concluida: ${totalCreated} feriados criados, ${totalSkipped} ignorados`,
      results,
    });
  } catch (error) {
    console.error('[holidays] Error syncing holidays:', error);
    res.status(500).json({ error: 'Falha ao sincronizar feriados: ' + (error as Error).message });
  }
});

/** POST /api/holidays/sync/:year - Sync holidays for a specific year */
router.post('/sync/:year', async (req: Request, res: Response) => {
  try {
    const year = parseInt(req.params.year as string, 10);

    if (isNaN(year) || year < 2020 || year > 2030) {
      res.status(400).json({ error: 'Ano invalido. Use um ano entre 2020 e 2030.' });
      return;
    }

    console.log(`[holidays] Starting holiday sync for ${year}...`);
    const result = await syncHolidaysForYear(year);

    res.json({
      success: true,
      message: `Sincronizacao de ${year} concluida: ${result.created} feriados criados, ${result.skipped} ignorados`,
      result,
    });
  } catch (error) {
    console.error('[holidays] Error syncing holidays for year:', error);
    res.status(500).json({ error: 'Falha ao sincronizar feriados: ' + (error as Error).message });
  }
});

/** GET /api/holidays/sync/available-years - Get available years for sync */
router.get('/sync/available-years', async (_req: Request, res: Response) => {
  try {
    const years = await getAvailableYears();
    res.json(years);
  } catch (error) {
    console.error('[holidays] Error getting available years:', error);
    res.status(500).json({ error: 'Failed to get available years' });
  }
});

export default router;
