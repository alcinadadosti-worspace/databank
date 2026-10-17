import { Router, Response } from 'express';
import * as queries from '../models/queries';
import { requireAuth, requireAdmin, type AuthenticatedRequest, type JwtPayload } from '../middleware/auth';
import {
  listCertificates, getCertificate, readCertificateFile, deleteCertificate, type MedicalCertificate,
} from '../services/medical-certificates';

/**
 * Medical certificates sent through Slack. Health data (LGPD): every route needs
 * a login — RH (admin) sees all, a gestor only their own team (same rule as the
 * team listing: leader_id or secondary_approver_id). Files are streamed by the
 * backend; there is no public URL.
 */
const router = Router();
router.use(requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 400;

/** null = sees everyone (RH) */
async function visibleEmployeeIds(user: JwtPayload): Promise<Set<number> | null> {
  if (user.role === 'admin') return null;
  const team = await queries.getEmployeesByLeaderId(user.id);
  return new Set(team.map(e => e.id));
}

function canSee(cert: MedicalCertificate, visible: Set<number> | null): boolean {
  if (visible === null) return true;
  return !cert.is_test && visible.has(cert.employee_id);
}

/** GET /api/medical-certificates?start=YYYY-MM-DD&end=YYYY-MM-DD */
router.get('/', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const start = String(req.query.start || '');
    const end = String(req.query.end || '');
    if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) {
      res.status(400).json({ error: 'start e end são obrigatórios (YYYY-MM-DD)' });
      return;
    }
    const days = (Date.parse(end) - Date.parse(start)) / 86_400_000;
    if (days > MAX_RANGE_DAYS) {
      res.status(400).json({ error: `Período máximo de ${MAX_RANGE_DAYS} dias` });
      return;
    }

    const visible = await visibleEmployeeIds(req.user!);
    const certs = (await listCertificates(start, end)).filter(c => canSee(c, visible));
    const empMap = new Map((await queries.getAllEmployees()).map(e => [e.id, e]));

    res.json({
      certificates: certs.map(c => {
        const emp = empMap.get(c.employee_id);
        return {
          id: c.id,
          employee_id: c.employee_id,
          employee_name: c.is_test ? 'Colaborador Teste' : emp?.name ?? `Colaborador ${c.employee_id}`,
          leader_name: c.is_test ? null : emp?.leader_name ?? null,
          date: c.date,
          daily_record_id: c.daily_record_id,
          justification_id: c.justification_id,
          flow: c.flow,
          filename: c.filename,
          mimetype: c.mimetype,
          size: c.size,
          uploaded_at: c.uploaded_at,
          uploaded_by: c.uploaded_by ?? 'employee',
          is_test: c.is_test,
        };
      }),
    });
  } catch (error) {
    console.error('[medical-certificates] Error listing:', error);
    res.status(500).json({ error: 'Falha ao listar atestados' });
  }
});

/** GET /api/medical-certificates/:id/file - the file itself, only for who can see it */
router.get('/:id/file', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const cert = await getCertificate(String(req.params.id));
    const visible = await visibleEmployeeIds(req.user!);
    // Same 404 for "doesn't exist" and "not your team": don't confirm the id exists
    if (!cert || !canSee(cert, visible)) {
      res.status(404).json({ error: 'Atestado não encontrado' });
      return;
    }

    const buf = await readCertificateFile(cert);
    await queries.logAudit('MEDICAL_CERTIFICATE_VIEWED', 'employee', cert.employee_id,
      `${req.user!.role} ${req.user!.name} opened ${cert.id} (${cert.date})`);

    res.setHeader('Content-Type', cert.mimetype);
    res.setHeader('Content-Length', String(buf.length));
    res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(cert.filename)}`);
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buf);
  } catch (error) {
    console.error('[medical-certificates] Error reading file:', error);
    res.status(500).json({ error: 'Falha ao abrir o atestado' });
  }
});

/** DELETE /api/medical-certificates/:id - RH only */
router.delete('/:id', requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const cert = await getCertificate(String(req.params.id));
    if (!cert) {
      res.status(404).json({ error: 'Atestado não encontrado' });
      return;
    }
    await deleteCertificate(cert);
    await queries.logAudit('MEDICAL_CERTIFICATE_DELETED', 'employee', cert.employee_id,
      `${req.user!.name} deleted ${cert.filename} (${cert.date}, ${cert.id})`);
    res.json({ success: true });
  } catch (error) {
    console.error('[medical-certificates] Error deleting:', error);
    res.status(500).json({ error: 'Falha ao excluir o atestado' });
  }
});

export default router;
