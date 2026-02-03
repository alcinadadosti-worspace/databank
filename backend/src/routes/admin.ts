import { Router, Request, Response } from 'express';
import * as queries from '../models/queries';

const router = Router();

/** GET /api/admin/audit-logs?limit=100&offset=0 */
router.get('/audit-logs', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 100;
    const offset = parseInt(req.query.offset as string, 10) || 0;
    const logs = await queries.getAuditLogs(limit, offset);
    res.json({ logs });
  } catch (error) {
    console.error('[admin] Error fetching audit logs:', error);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

/** GET /api/admin/export?start=YYYY-MM-DD&end=YYYY-MM-DD - Export records as CSV */
router.get('/export', async (req: Request, res: Response) => {
  try {
    const { start, end } = req.query;
    if (!start || !end || typeof start !== 'string' || typeof end !== 'string') {
      res.status(400).json({ error: 'start and end parameters required' });
      return;
    }

    const records = await queries.getAllRecordsRange(start, end);

    const csvHeader = 'Data,Colaborador,Líder,Entrada,Saída Almoço,Retorno Almoço,Saída,Total(min),Diferença(min),Classificação,Justificativa\n';
    const csvRows = records.map((r: any) =>
      [
        r.date,
        `"${r.employee_name}"`,
        `"${r.leader_name}"`,
        r.punch_1 || '',
        r.punch_2 || '',
        r.punch_3 || '',
        r.punch_4 || '',
        r.total_worked_minutes ?? '',
        r.difference_minutes ?? '',
        r.classification || '',
        `"${r.justification_reason || ''}"`,
      ].join(',')
    ).join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=banco-horas-${start}-${end}.csv`);
    res.send('\uFEFF' + csvHeader + csvRows);
  } catch (error) {
    console.error('[admin] Error exporting:', error);
    res.status(500).json({ error: 'Failed to export' });
  }
});

/** GET /api/admin/dashboard - Overview stats */
router.get('/dashboard', async (_req: Request, res: Response) => {
  try {
    const stats = await queries.getDashboardStats();
    res.json(stats);
  } catch (error) {
    console.error('[admin] Error fetching dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

export default router;
