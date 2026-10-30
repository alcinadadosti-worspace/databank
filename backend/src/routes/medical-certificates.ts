import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import * as queries from '../models/queries';
import { requireAuth, requireAdmin, type AuthenticatedRequest, type JwtPayload } from '../middleware/auth';
import { refreshStoredDaysSafe } from '../services/day-recalc';
import { getExpectedMinutes, getLojaSustentavelExpectedMinutes, isLojaSustentavelEmployee } from '../config/constants';
import {
  listCertificates, getCertificate, readCertificateFile, deleteCertificate, saveCertificate,
  detectCertificateFileType, CertificateFileError, MAX_CERTIFICATE_BYTES, MAX_FILES_PER_UPLOAD,
  type MedicalCertificate,
} from '../services/medical-certificates';

/**
 * Medical certificates: files sent through Slack and atestados registered in the
 * panel by the RH or the employee's gestor. Health data (LGPD): every route needs
 * a login — RH (admin) sees all, a gestor only their own team (same rule as the
 * team listing: leader_id or secondary_approver_id). Files are streamed by the
 * backend; there is no public URL.
 */
const router = Router();
router.use(requireAuth);

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 400;
/** A medical leave can run for months; this only stops a typo like 3000 days */
const MAX_LEAVE_DAYS = 365;
const MAX_LEAVE_HOURS = 12;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_CERTIFICATE_BYTES, files: MAX_FILES_PER_UPLOAD },
});

/** Multer errors (file too big, too many files) as JSON instead of Express' HTML error page */
function uploadFiles(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  upload.array('files', MAX_FILES_PER_UPLOAD)(req, res, (err: unknown) => {
    if (!err) return next();
    const code = (err as { code?: string }).code;
    const error = code === 'LIMIT_FILE_SIZE' ? 'O arquivo passa de 10 MB'
      : code === 'LIMIT_FILE_COUNT' || code === 'LIMIT_UNEXPECTED_FILE' ? `Envie no máximo ${MAX_FILES_PER_UPLOAD} arquivos`
        : 'Falha ao receber o arquivo';
    res.status(400).json({ error });
  });
}

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

/** RH deletes any atestado; a gestor only the ones they launched, for someone still on their team */
function canDeleteLeave(leave: queries.MedicalLeave, user: JwtPayload, visible: Set<number> | null): boolean {
  if (user.role === 'admin') return true;
  return leave.created_by_role === 'manager' && leave.created_by_leader_id === user.id
    && !!visible?.has(leave.employee_id);
}

function toApiCertificate(c: MedicalCertificate, emp: queries.EmployeeWithLeader | undefined) {
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
}

function addDays(date: string, days: number): string {
  const d = new Date(date + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().split('T')[0];
}

function formatDateBR(date: string): string {
  const [y, m, d] = date.split('-');
  return `${d}/${m}/${y}`;
}

/** 90 → "1h30", 480 → "8h" */
function formatMinutesBR(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`;
}

function describeLeave(l: Pick<queries.MedicalLeave, 'kind' | 'start_date' | 'end_date' | 'days' | 'hours'>): string {
  if (l.kind === 'hours') return `${formatMinutesBR((l.hours ?? 0) * 60)} em ${formatDateBR(l.start_date)}`;
  return `${l.days} dia(s), ${formatDateBR(l.start_date)} a ${formatDateBR(l.end_date)}`;
}

/** Multer reads multipart file names as latin1; browsers send UTF-8 ("Atestado José.pdf") */
function utf8Name(name: string): string {
  return Buffer.from(name, 'latin1').toString('utf8');
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

    res.json({ certificates: certs.map(c => toApiCertificate(c, empMap.get(c.employee_id))) });
  } catch (error) {
    console.error('[medical-certificates] Error listing:', error);
    res.status(500).json({ error: 'Falha ao listar atestados' });
  }
});

/** GET /api/medical-certificates/leaves?start=&end= - panel atestados overlapping the period */
router.get('/leaves', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const start = String(req.query.start || '');
    const end = String(req.query.end || '');
    if (!DATE_RE.test(start) || !DATE_RE.test(end) || start > end) {
      res.status(400).json({ error: 'start e end são obrigatórios (YYYY-MM-DD)' });
      return;
    }

    const visible = await visibleEmployeeIds(req.user!);
    const leaves = (await queries.getMedicalLeavesInRange(start, end))
      .filter(l => visible === null || visible.has(l.employee_id));
    const empMap = new Map((await queries.getAllEmployees()).map(e => [e.id, e]));
    const certs = new Map<string, MedicalCertificate>();
    for (const c of await Promise.all(leaves.flatMap(l => l.certificate_ids).map(getCertificate))) {
      if (c) certs.set(c.id, c);
    }

    res.json({
      leaves: leaves.map(l => {
        const emp = empMap.get(l.employee_id);
        return {
          ...l,
          employee_name: emp?.name ?? `Colaborador ${l.employee_id}`,
          leader_id: emp?.leader_id ?? null,
          leader_name: emp?.leader_name ?? null,
          created_by_role: l.created_by_role ?? 'rh',
          can_delete: canDeleteLeave(l, req.user!, visible),
          certificates: l.certificate_ids
            .map(id => certs.get(id))
            .filter((c): c is MedicalCertificate => !!c)
            .map(c => toApiCertificate(c, emp)),
        };
      }),
    });
  } catch (error) {
    console.error('[medical-certificates] Error listing leaves:', error);
    res.status(500).json({ error: 'Falha ao listar atestados lançados' });
  }
});

/**
 * POST /api/medical-certificates/leaves - RH for anyone, a gestor for their own team (multipart)
 * Fields: employee_id, kind ('days' | 'hours'), start_date, days | hours, notes?; files (up to 3,
 * optional for the RH, required for a gestor)
 */
router.post('/leaves', uploadFiles, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const files = (req.files as Express.Multer.File[] | undefined) ?? [];
    const isManager = req.user!.role === 'manager';
    const employeeId = Number(req.body.employee_id);
    const kind = req.body.kind;
    const startDate = String(req.body.start_date || '');
    const notes = String(req.body.notes || '').trim().slice(0, 500) || null;

    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      res.status(400).json({ error: 'Escolha o colaborador' });
      return;
    }
    const visible = await visibleEmployeeIds(req.user!);
    if (visible && !visible.has(employeeId)) {
      res.status(403).json({ error: 'Esse colaborador não é da sua equipe' });
      return;
    }
    // The gestor's atestado silences alerts for the whole period: the RH needs the document behind it
    if (isManager && files.length === 0) {
      res.status(400).json({ error: 'Anexe o arquivo do atestado (PDF ou foto)' });
      return;
    }
    if (kind !== 'days' && kind !== 'hours') {
      res.status(400).json({ error: 'Escolha se o atestado é em dias ou em horas' });
      return;
    }
    // Round trip catches dates that don't exist (2026-02-30 would roll over to March)
    if (!DATE_RE.test(startDate) || isNaN(Date.parse(startDate)) || addDays(startDate, 0) !== startDate) {
      res.status(400).json({ error: 'Data inválida' });
      return;
    }

    let days: number | null = null;
    let hours: number | null = null;
    let endDate = startDate;
    if (kind === 'days') {
      days = Number(req.body.days);
      if (!Number.isInteger(days) || days < 1 || days > MAX_LEAVE_DAYS) {
        res.status(400).json({ error: `A quantidade de dias deve ser de 1 a ${MAX_LEAVE_DAYS}` });
        return;
      }
      endDate = addDays(startDate, days - 1);
    } else {
      hours = Number(req.body.hours);
      // Quarter hours keep the minutes taken off the day a whole number
      if (!Number.isFinite(hours) || hours <= 0 || hours > MAX_LEAVE_HOURS || !Number.isInteger(hours * 4)) {
        res.status(400).json({ error: `As horas devem ser de 15 min a ${MAX_LEAVE_HOURS}h, em passos de 15 min` });
        return;
      }
    }

    const employee = await queries.getEmployeeById(employeeId);
    if (!employee) {
      res.status(404).json({ error: 'Colaborador não encontrado' });
      return;
    }

    if (kind === 'hours') {
      // Same journey the sync expects that day. Hours covering all of it would leave the
      // day without punches counted as an absence — that's a whole day off.
      const expected = isLojaSustentavelEmployee(employee.name)
        ? getLojaSustentavelExpectedMinutes(startDate)
        : getExpectedMinutes(startDate, employee.is_apprentice === true, employee.expected_daily_minutes || 240, employee.name, employee.schedule_overrides);
      if (expected <= 0) {
        res.status(400).json({ error: `${formatDateBR(startDate)} não é dia de trabalho de ${employee.name}: não há horas para abonar` });
        return;
      }
      if (hours! * 60 >= expected) {
        res.status(400).json({ error: `A jornada de ${employee.name} nesse dia é de ${formatMinutesBR(expected)}: essas horas cobrem o dia inteiro. Lance como 1 dia.` });
        return;
      }
    }

    const overlap = (await queries.getMedicalLeavesInRange(startDate, endDate)).find(l => l.employee_id === employeeId);
    if (overlap) {
      // A gestor can't delete what the RH (or another gestor) launched
      const fix = canDeleteLeave(overlap, req.user!, visible) ? 'Exclua o anterior para lançar de novo.' : 'Para mudar, fale com o RH.';
      res.status(409).json({ error: `${employee.name} já tem atestado lançado nesse período (${describeLeave(overlap)}). ${fix}` });
      return;
    }

    // Check every file before saving anything, so a bad one doesn't leave half an atestado
    for (const f of files) {
      if (!detectCertificateFileType(f.buffer)) {
        res.status(400).json({ error: `"${utf8Name(f.originalname)}": só aceitamos foto (JPG, PNG, HEIC, WEBP) ou PDF` });
        return;
      }
    }

    const leave = await queries.insertMedicalLeave({
      employee_id: employeeId, kind, start_date: startDate, end_date: endDate, days, hours, notes,
      created_by: req.user!.name,
      created_by_role: isManager ? 'manager' : 'rh',
      created_by_leader_id: isManager ? req.user!.id : null,
    });
    const saved: MedicalCertificate[] = [];
    try {
      for (const f of files) {
        saved.push(await saveCertificate({
          buffer: f.buffer,
          originalName: utf8Name(f.originalname),
          employeeId,
          date: startDate,
          dailyRecordId: null,
          justificationId: null,
          flow: 'rh',
          uploadedBy: isManager ? 'manager' : 'rh',
          uploadedBySlackId: null,
          slackFileId: null,
        }));
      }
      if (saved.length > 0) await queries.setMedicalLeaveCertificates(leave.id, saved.map(c => c.id));
    } catch (error) {
      // Undo: whoever launched it just tries again instead of finding an atestado without its file
      await Promise.all(saved.map(c => deleteCertificate(c).catch(() => undefined)));
      await queries.deleteMedicalLeave(leave.id).catch(() => undefined);
      throw error;
    }

    await queries.logAudit('MEDICAL_LEAVE_CREATED', 'employee', employeeId,
      `${req.user!.name}: ${employee.name} — ${describeLeave(leave)}${saved.length ? `, ${saved.length} arquivo(s)` : ''} (${leave.id})`);
    // Days already in the past stop showing Atraso/Sem registro. Only reclassifies
    // stored records — no Slack message goes out.
    await refreshStoredDaysSafe(employeeId, startDate, endDate);

    res.status(201).json({ success: true, leave: { ...leave, certificate_ids: saved.map(c => c.id) } });
  } catch (error) {
    if (error instanceof CertificateFileError) {
      res.status(400).json({ error: error.message });
      return;
    }
    console.error('[medical-certificates] Error creating leave:', error);
    res.status(500).json({ error: 'Falha ao lançar o atestado' });
  }
});

/** DELETE /api/medical-certificates/leaves/:id - RH, or the gestor who launched it; also deletes its files */
router.delete('/leaves/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const leave = await queries.getMedicalLeave(String(req.params.id));
    const visible = await visibleEmployeeIds(req.user!);
    // Same 404 for "doesn't exist" and "not your team": don't confirm the id exists
    if (!leave || (visible && !visible.has(leave.employee_id))) {
      res.status(404).json({ error: 'Atestado não encontrado' });
      return;
    }
    if (!canDeleteLeave(leave, req.user!, visible)) {
      res.status(403).json({ error: 'Só o RH exclui atestado lançado por outra pessoa' });
      return;
    }
    for (const id of leave.certificate_ids) {
      const cert = await getCertificate(id);
      if (cert) await deleteCertificate(cert);
    }
    await queries.deleteMedicalLeave(leave.id);
    const employee = await queries.getEmployeeById(leave.employee_id);
    await queries.logAudit('MEDICAL_LEAVE_DELETED', 'employee', leave.employee_id,
      `${req.user!.name}: ${employee?.name ?? leave.employee_id} — ${describeLeave(leave)} (${leave.id})`);
    // Whole days go back to what the punches say (Sem registro, Atraso…), silently
    await refreshStoredDaysSafe(leave.employee_id, leave.start_date, leave.end_date, { releaseAtestado: leave.kind === 'days' });
    res.json({ success: true });
  } catch (error) {
    console.error('[medical-certificates] Error deleting leave:', error);
    res.status(500).json({ error: 'Falha ao excluir o atestado' });
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
