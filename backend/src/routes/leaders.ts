import { Router, Request, Response } from 'express';
import * as queries from '../models/queries';

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

/** POST /api/leaders/auth - Authenticate manager by email or master password */
router.post('/auth', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Check master password first
    if (password === MASTER_PASSWORD) {
      res.json({
        success: true,
        leader: {
          id: 0,
          name: 'Administrador',
          email: 'admin',
          isAdmin: true,
        }
      });
      return;
    }

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
        isAdmin: false,
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

export default router;
