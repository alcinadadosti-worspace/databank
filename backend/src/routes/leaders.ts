import { Router, Request, Response } from 'express';
import * as queries from '../models/queries';

const router = Router();

/** GET /api/leaders - List all leaders */
router.get('/', (_req: Request, res: Response) => {
  try {
    const leaders = queries.getAllLeaders();
    res.json({ leaders });
  } catch (error) {
    console.error('[leaders] Error fetching leaders:', error);
    res.status(500).json({ error: 'Failed to fetch leaders' });
  }
});

/** GET /api/leaders/:id - Get single leader with their employees */
router.get('/:id', (req: Request, res: Response) => {
  try {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: 'Invalid leader ID' });
      return;
    }
    const leader = queries.getLeaderById(id);
    if (!leader) {
      res.status(404).json({ error: 'Leader not found' });
      return;
    }
    const employees = queries.getEmployeesByLeaderId(id);
    res.json({ leader, employees });
  } catch (error) {
    console.error('[leaders] Error fetching leader:', error);
    res.status(500).json({ error: 'Failed to fetch leader' });
  }
});

export default router;
