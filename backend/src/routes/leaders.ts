import { Router, Request, Response } from 'express';
import * as queries from '../models/queries';
import { syncPunches } from '../jobs/sync-punches';

const router = Router();

// Master password for full access
const MASTER_PASSWORD = '198738';

// Manager email authentication mapping
const MANAGER_EMAILS: Record<string, string> = {
  'rafaela@cpalcina.com': 'Rafaela Alves Mendes',
  'marianessousa02@gmail.com': 'Mariane Santos Sousa',
  'kemillyrafaelly05@hotmail.com': 'Kemilly Rafaelly Souza Silva',
  'alberto@cpalcina.com': 'Alberto Luiz Marinho Batista',
  'romulo@cpalcina.com': 'Romulo Jose Santos Lisboa',
  'tacianep@outlook.com': 'Maria Taciane Pereira Barbosa',
  'leidiane@cpalcina.com': 'Leidiane Souza',
  'erick.cafe@gmail.com': 'Erick Café Santos Júnior',
  'joao_tavares_17@hotmail.com': 'Joao Antonio Tavares Santos',
  'carloscontato148@gmail.com': 'Carlos Eduardo Silva De Oliveira',
  'claramatoschagas@gmail.com': 'Ana Clara de Matos Chagas',
  'jontahenrique@gmail.com': 'Jonathan Henrique da Conceição Silva',
  'michael@cpalcina.com': 'Michaell Jean Nunes De Carvalho',
  'suzana@cpalcina.com': 'Suzana Martins Tavares',
};

/** POST /api/leaders/auth - Authenticate manager by email */
router.post('/auth', async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'Email é obrigatório' });
      return;
    }

    const normalizedEmail = email.toLowerCase().trim();
    const managerName = MANAGER_EMAILS[normalizedEmail];

    if (!managerName) {
      res.status(401).json({ error: 'Email não autorizado' });
      return;
    }

    // Find the leader by name
    const allLeaders = await queries.getAllLeaders();
    const leader = allLeaders.find(l =>
      l.name.toLowerCase() === managerName.toLowerCase() ||
      l.name_normalized?.toLowerCase() === managerName.toLowerCase()
    );

    if (!leader) {
      res.status(404).json({ error: 'Gestor não encontrado no sistema' });
      return;
    }

    res.json({
      success: true,
      leader: {
        id: leader.id,
        name: leader.name,
        email: normalizedEmail,
      }
    });
  } catch (error) {
    console.error('[leaders] Error authenticating manager:', error);
    res.status(500).json({ error: 'Erro ao autenticar' });
  }
});

/** POST /api/leaders/auth-admin - Authenticate admin by master password */
router.post('/auth-admin', async (req: Request, res: Response) => {
  try {
    const { password } = req.body;

    if (password === MASTER_PASSWORD) {
      res.json({
        success: true,
        admin: {
          name: 'Administrador RH',
          authenticated: true,
        }
      });
      return;
    }

    res.status(401).json({ error: 'Senha incorreta' });
  } catch (error) {
    console.error('[leaders] Error authenticating admin:', error);
    res.status(500).json({ error: 'Erro ao autenticar' });
  }
});

/** GET /api/leaders?sector=... - List leaders, optionally filtered by sector */
router.get('/', async (req: Request, res: Response) => {
  try {
    const sector = req.query.sector as string | undefined;
    const allLeaders = await queries.getAllLeaders();
    // Filter out leaders that are actually just employees (e.g. Ravy id=16)
    const HIDDEN_LEADER_IDS = [16];
    const visibleLeaders = allLeaders.filter(l => !HIDDEN_LEADER_IDS.includes(l.id));
    const leaders = sector
      ? visibleLeaders.filter(l => l.sector === sector)
      : visibleLeaders;
    const sectors = [...new Set(visibleLeaders.map(l => l.sector).filter(Boolean))].sort() as string[];
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

// In-memory sync status tracking for manager syncs
interface ManagerSyncStatus {
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
}

const managerSyncJobs = new Map<string, ManagerSyncStatus>();

/** POST /api/leaders/:id/sync - Sync punches for a leader's team (no notifications) */
router.post('/:id/sync', async (req: Request, res: Response) => {
  try {
    const leaderId = parseInt(req.params.id as string, 10);
    if (isNaN(leaderId)) {
      res.status(400).json({ error: 'Invalid leader ID' });
      return;
    }

    const { startDate, endDate } = req.body;

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
    const jobId = `manager_sync_${leaderId}_${Date.now()}`;

    // Create initial status
    const status: ManagerSyncStatus = {
      id: jobId,
      status: 'running',
      startDate,
      endDate,
      totalDays: diffDays,
      synced: 0,
      errors: 0,
      startedAt: new Date().toISOString(),
    };
    managerSyncJobs.set(jobId, status);

    console.log(`[leaders] Manager sync started for leader ${leaderId}: ${startDate} to ${endDate} (${diffDays} days) - Job ${jobId}`);

    // Return immediately with job ID
    res.json({
      success: true,
      message: 'Sync started in background (no notifications)',
      jobId,
      totalDays: diffDays,
    });

    // Run sync in background (after response is sent) - NO NOTIFICATIONS
    setImmediate(async () => {
      const current = new Date(start);

      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];
        status.currentDate = dateStr;

        try {
          await syncPunches(dateStr, { skipNotifications: true });
          status.synced++;
          console.log(`[leaders] Manager sync: ${dateStr} (${status.synced}/${diffDays})`);
        } catch (err) {
          status.errors++;
          console.error(`[leaders] Manager sync error ${dateStr}:`, err);
        }

        current.setDate(current.getDate() + 1);
      }

      status.status = 'completed';
      status.completedAt = new Date().toISOString();

      await queries.logAudit('MANAGER_SYNC', 'leader', leaderId,
        `Synced range ${startDate} to ${endDate}: ${status.synced} days synced, ${status.errors} errors`);

      console.log(`[leaders] Manager sync completed: ${status.synced} days synced, ${status.errors} errors`);

      // Clean up old jobs after 1 hour
      setTimeout(() => managerSyncJobs.delete(jobId), 60 * 60 * 1000);
    });
  } catch (error) {
    console.error('[leaders] Error starting manager sync:', error);
    res.status(500).json({ error: 'Failed to start sync' });
  }
});

/** GET /api/leaders/sync-status/:jobId - Get status of a manager sync job */
router.get('/sync-status/:jobId', (req: Request, res: Response) => {
  const jobId = req.params.jobId as string;
  const status = managerSyncJobs.get(jobId);

  if (!status) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  res.json(status);
});

export default router;
