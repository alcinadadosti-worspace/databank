import { Router, Request, Response } from 'express';
import * as queries from '../models/queries';
import {
  validateBody,
  punchAdjustmentApprovalSchema,
  punchAdjustmentRejectionSchema
} from '../middleware/validation';
import { sendReinforcePunchAdjustmentAlert } from '../slack/bot';

const router = Router();

/** GET /api/punch-adjustments/reviewed - Get all reviewed punch adjustments (for admin) */
router.get('/reviewed', async (req: Request, res: Response) => {
  try {
    const adjustments = await queries.getReviewedPunchAdjustments();
    res.json({ adjustments });
  } catch (error) {
    console.error('[punch-adjustments] Error fetching reviewed:', error);
    res.status(500).json({ error: 'Failed to fetch reviewed punch adjustments' });
  }
});

/** GET /api/punch-adjustments/leader/:leaderId/pending - Get pending punch adjustments for a leader */
router.get('/leader/:leaderId/pending', async (req: Request, res: Response) => {
  try {
    const leaderId = parseInt(req.params.leaderId as string, 10);

    if (isNaN(leaderId)) {
      res.status(400).json({ error: 'Invalid leader ID' });
      return;
    }

    const adjustments = await queries.getPendingPunchAdjustments(leaderId);
    res.json({ adjustments });
  } catch (error) {
    console.error('[punch-adjustments] Error fetching pending:', error);
    res.status(500).json({ error: 'Failed to fetch pending punch adjustments' });
  }
});

/** POST /api/punch-adjustments/:id/approve - Approve a punch adjustment with corrected times */
router.post('/:id/approve', validateBody(punchAdjustmentApprovalSchema), async (req: Request, res: Response) => {
  try {
    const adjustmentId = parseInt(req.params.id as string, 10);
    const { reviewedBy, comment, corrected_punch_1, corrected_punch_2, corrected_punch_3, corrected_punch_4 } = req.body;

    if (isNaN(adjustmentId)) {
      res.status(400).json({ error: 'Invalid adjustment ID' });
      return;
    }

    // Get the adjustment to find the daily record
    const adjustment = await queries.getPunchAdjustmentById(adjustmentId);
    if (!adjustment) {
      res.status(404).json({ error: 'Punch adjustment not found' });
      return;
    }

    // Approve the adjustment
    await queries.approvePunchAdjustment(
      adjustmentId,
      reviewedBy || 'manager',
      {
        punch_1: corrected_punch_1 || null,
        punch_2: corrected_punch_2 || null,
        punch_3: corrected_punch_3 || null,
        punch_4: corrected_punch_4 || null,
      },
      comment || ''
    );

    // Update the daily record with corrected times if provided
    const record = await queries.getDailyRecordById(adjustment.daily_record_id);
    if (record) {
      const newPunch1 = corrected_punch_1 || record.punch_1;
      const newPunch2 = corrected_punch_2 || record.punch_2;
      const newPunch3 = corrected_punch_3 || record.punch_3;
      const newPunch4 = corrected_punch_4 || record.punch_4;

      // Recalculate hours with new punches
      const { calculateDailyHours } = await import('../services/hours-calculator');
      const employee = await queries.getEmployeeById(record.employee_id);
      const isApprentice = employee?.is_apprentice ?? false;

      const result = calculateDailyHours(
        { punch1: newPunch1 ?? null, punch2: newPunch2 ?? null, punch3: newPunch3 ?? null, punch4: newPunch4 ?? null },
        { date: record.date, isApprentice, employeeName: employee?.name }
      );

      const totalWorkedMinutes = result?.totalWorkedMinutes ?? null;
      const differenceMinutes = result?.differenceMinutes ?? null;
      const classification = result?.classification ?? null;

      await queries.updateDailyRecordPunches(
        record.id,
        newPunch1 || null,
        newPunch2 || null,
        newPunch3 || null,
        newPunch4 || null,
        totalWorkedMinutes,
        differenceMinutes,
        classification
      );
    }

    await queries.logAudit('PUNCH_ADJUSTMENT_APPROVED', 'punch_adjustment', adjustmentId,
      `Approved by ${reviewedBy || 'manager'}: ${comment || 'No comment'}`);

    res.json({ success: true, message: 'Ajuste de ponto aprovado' });
  } catch (error) {
    console.error('[punch-adjustments] Error approving:', error);
    res.status(500).json({ error: 'Failed to approve punch adjustment' });
  }
});

/** POST /api/punch-adjustments/:id/reject - Reject a punch adjustment */
router.post('/:id/reject', validateBody(punchAdjustmentRejectionSchema), async (req: Request, res: Response) => {
  try {
    const adjustmentId = parseInt(req.params.id as string, 10);
    const { reviewedBy, comment } = req.body;

    if (isNaN(adjustmentId)) {
      res.status(400).json({ error: 'Invalid adjustment ID' });
      return;
    }

    // Validation is now handled by Zod middleware

    const adjustment = await queries.getPunchAdjustmentById(adjustmentId);
    if (!adjustment) {
      res.status(404).json({ error: 'Punch adjustment not found' });
      return;
    }

    await queries.rejectPunchAdjustment(adjustmentId, reviewedBy || 'manager', comment);

    await queries.logAudit('PUNCH_ADJUSTMENT_REJECTED', 'punch_adjustment', adjustmentId,
      `Rejected by ${reviewedBy || 'manager'}: ${comment}`);

    res.json({ success: true, message: 'Ajuste de ponto rejeitado' });
  } catch (error) {
    console.error('[punch-adjustments] Error rejecting:', error);
    res.status(500).json({ error: 'Failed to reject punch adjustment' });
  }
});

/** GET /api/punch-adjustments/leader/:leaderId/unadjusted
 *  Daily records with classification='ajuste' that have no associated punch_adjustment.
 */
router.get('/leader/:leaderId/unadjusted', async (req: Request, res: Response) => {
  try {
    const leaderId = parseInt(req.params.leaderId as string, 10);
    if (isNaN(leaderId)) {
      res.status(400).json({ error: 'Invalid leader ID' });
      return;
    }
    const days = req.query.days ? parseInt(req.query.days as string, 10) : 30;
    const records = await queries.getRecordsWithoutAdjustmentByLeader(leaderId, isNaN(days) ? 30 : days);
    res.json({ records });
  } catch (error) {
    console.error('[punch-adjustments] Error fetching unadjusted:', error);
    res.status(500).json({ error: 'Failed to fetch records without adjustment' });
  }
});

/** POST /api/punch-adjustments/reinforce-alert
 *  Sends a Slack reminder for each daily_record_id where the employee has not yet
 *  submitted an ajuste. Re-validates each id on the server (defense in depth) — if a
 *  record already has a punch_adjustment, that id is skipped silently and is not counted.
 */
router.post('/reinforce-alert', async (req: Request, res: Response) => {
  try {
    const { recordIds } = req.body as { recordIds: number[] };
    if (!Array.isArray(recordIds) || recordIds.length === 0) {
      res.status(400).json({ error: 'recordIds array is required' });
      return;
    }

    let sent = 0;
    const skipped: { recordId: number; reason: string }[] = [];

    for (const recordId of recordIds) {
      const gate = await queries.isRecordEligibleForAdjustmentAction(recordId);
      if (!gate.eligible || !gate.record) {
        skipped.push({ recordId, reason: gate.reason ?? 'ineligible' });
        continue;
      }
      const employee = await queries.getEmployeeById(gate.record.employee_id);
      if (!employee || !employee.slack_id) {
        skipped.push({ recordId, reason: 'no_slack_id' });
        continue;
      }
      const missing: string[] = [];
      if (!gate.record.punch_1) missing.push('Entrada');
      if (!gate.record.punch_2) missing.push('Intervalo');
      if (!gate.record.punch_3) missing.push('Retorno');
      if (!gate.record.punch_4) missing.push('Saída');

      await sendReinforcePunchAdjustmentAlert(
        { id: employee.id, name: employee.name, slack_id: employee.slack_id },
        gate.record,
        gate.record.date,
        missing
      );
      await queries.logAudit('REINFORCE_ADJUSTMENT_ALERT_SENT', 'daily_record', recordId,
        `Reinforce ajuste alert sent to ${employee.name}`);
      sent++;
    }

    res.json({ success: true, sent, skipped: skipped.length });
  } catch (error) {
    console.error('[punch-adjustments] Error sending reinforce-alert:', error);
    res.status(500).json({ error: 'Failed to send reinforce alerts' });
  }
});

/** POST /api/punch-adjustments/record/:recordId/force-review
 *  Manager approves/rejects an ajuste without employee submission. Creates a
 *  punch_adjustment with status='approved'|'rejected'. If approve, applies corrected
 *  punches to daily_record and recalculates hours.
 */
router.post('/record/:recordId/force-review', async (req: Request, res: Response) => {
  try {
    const recordId = parseInt(req.params.recordId as string, 10);
    const {
      action,
      reviewedBy,
      comment,
      employeeId,
      corrected_punch_1,
      corrected_punch_2,
      corrected_punch_3,
      corrected_punch_4,
    } = req.body as {
      action: 'approve' | 'reject';
      reviewedBy: string;
      comment: string;
      employeeId: number;
      corrected_punch_1?: string | null;
      corrected_punch_2?: string | null;
      corrected_punch_3?: string | null;
      corrected_punch_4?: string | null;
    };

    if (isNaN(recordId) || !action || !comment?.trim() || !employeeId) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }
    if (action !== 'approve' && action !== 'reject') {
      res.status(400).json({ error: 'action must be "approve" or "reject"' });
      return;
    }

    const gate = await queries.isRecordEligibleForAdjustmentAction(recordId);
    if (!gate.eligible || !gate.record) {
      res.status(409).json({ error: 'Registro não está elegível para ajuste manual', reason: gate.reason });
      return;
    }

    // If approve, validate at least one corrected punch
    if (action === 'approve') {
      const hasAny = corrected_punch_1 || corrected_punch_2 || corrected_punch_3 || corrected_punch_4;
      if (!hasAny) {
        res.status(400).json({ error: 'Informe pelo menos um horário corrigido para aprovar' });
        return;
      }
    }

    const missing: string[] = [];
    if (!gate.record.punch_1) missing.push('Entrada');
    if (!gate.record.punch_2) missing.push('Intervalo');
    if (!gate.record.punch_3) missing.push('Retorno');
    if (!gate.record.punch_4) missing.push('Saída');

    const { adjustmentId } = await queries.forcePunchAdjustment({
      recordId,
      employeeId,
      action,
      reviewedBy: reviewedBy || 'manager',
      comment,
      missingPunches: missing,
      correctedTimes: action === 'approve' ? {
        punch_1: corrected_punch_1 ?? null,
        punch_2: corrected_punch_2 ?? null,
        punch_3: corrected_punch_3 ?? null,
        punch_4: corrected_punch_4 ?? null,
      } : undefined,
    });

    if (action === 'approve') {
      const newPunch1 = corrected_punch_1 ?? gate.record.punch_1 ?? null;
      const newPunch2 = corrected_punch_2 ?? gate.record.punch_2 ?? null;
      const newPunch3 = corrected_punch_3 ?? gate.record.punch_3 ?? null;
      const newPunch4 = corrected_punch_4 ?? gate.record.punch_4 ?? null;

      const { calculateDailyHours } = await import('../services/hours-calculator');
      const employee = await queries.getEmployeeById(gate.record.employee_id);
      const isApprentice = employee?.is_apprentice ?? false;

      const result = calculateDailyHours(
        { punch1: newPunch1, punch2: newPunch2, punch3: newPunch3, punch4: newPunch4 },
        { date: gate.record.date, isApprentice, employeeName: employee?.name }
      );

      await queries.updateDailyRecordPunches(
        gate.record.id,
        newPunch1,
        newPunch2,
        newPunch3,
        newPunch4,
        result?.totalWorkedMinutes ?? null,
        result?.differenceMinutes ?? null,
        result?.classification ?? null
      );
    }

    await queries.logAudit(
      action === 'approve' ? 'PUNCH_ADJUSTMENT_FORCE_APPROVED' : 'PUNCH_ADJUSTMENT_FORCE_REJECTED',
      'daily_record',
      recordId,
      `${action} by ${reviewedBy || 'manager'} without employee submission: ${comment}`
    );

    res.json({ success: true, adjustmentId });
  } catch (error) {
    console.error('[punch-adjustments] Error force-reviewing:', error);
    res.status(500).json({ error: 'Failed to force review record' });
  }
});

/** DELETE /api/punch-adjustments/:id - Delete a punch adjustment */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const adjustmentId = parseInt(req.params.id as string, 10);

    if (isNaN(adjustmentId)) {
      res.status(400).json({ error: 'Invalid adjustment ID' });
      return;
    }

    const deleted = await queries.deletePunchAdjustment(adjustmentId);
    if (!deleted) {
      res.status(404).json({ error: 'Punch adjustment not found' });
      return;
    }

    await queries.logAudit('PUNCH_ADJUSTMENT_DELETED', 'punch_adjustment', adjustmentId, 'Deleted');

    res.json({ success: true, message: 'Ajuste de ponto removido' });
  } catch (error) {
    console.error('[punch-adjustments] Error deleting:', error);
    res.status(500).json({ error: 'Failed to delete punch adjustment' });
  }
});

export default router;
