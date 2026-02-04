import { Router, Request, Response } from 'express';
import * as queries from '../models/queries';

const router = Router();

/** GET /api/leaders?sector=... - List leaders, optionally filtered by sector */
router.get('/', async (req: Request, res: Response) => {
  try {
    const sector = req.query.sector as string | undefined;
    const allLeaders = await queries.getAllLeaders();
    const leaders = sector
      ? allLeaders.filter(l => l.sector === sector)
      : allLeaders;
    const sectors = [...new Set(allLeaders.map(l => l.sector).filter(Boolean))].sort() as string[];
    res.json({ leaders, sectors });
  } catch (error) {
    console.error('[leaders] Error fetching leaders:', error);
    res.status(500).json({ error: 'Failed to fetch leaders' });
  }
});

/** GET /api/leaders/:id - Get single leader with their employees */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid leader ID' });
      return;
    }
    const leader = await queries.getLeaderById(id);
    if (!leader) {
      res.status(404).json({ error: 'Leader not found' });
      return;
    }
    const employees = await queries.getEmployeesByLeaderId(id);
    res.json({ leader, employees });
  } catch (error) {
    console.error('[leaders] Error fetching leader:', error);
    res.status(500).json({ error: 'Failed to fetch leader' });
  }
});

export default router;
