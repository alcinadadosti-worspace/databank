import { Router, Request, Response } from 'express';
import * as queries from '../models/queries';

const router = Router();

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
router.post('/:id/approve', async (req: Request, res: Response) => {
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
      const expectedMinutes = employee?.expected_daily_minutes || 528;

      const result = calculateDailyHours(
        { punch1: newPunch1 ?? null, punch2: newPunch2 ?? null, punch3: newPunch3 ?? null, punch4: newPunch4 ?? null },
        { expectedMinutes }
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
router.post('/:id/reject', async (req: Request, res: Response) => {
  try {
    const adjustmentId = parseInt(req.params.id as string, 10);
    const { reviewedBy, comment } = req.body;

    if (isNaN(adjustmentId)) {
      res.status(400).json({ error: 'Invalid adjustment ID' });
      return;
    }

    if (!comment || comment.trim().length === 0) {
      res.status(400).json({ error: 'Comentario obrigatorio ao rejeitar' });
      return;
    }

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
