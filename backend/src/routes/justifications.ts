import { Router, Request, Response } from 'express';
import * as queries from '../models/queries';
import { sendJustificationReviewNotification } from '../slack/bot';

const router = Router();

/** GET /api/justifications/employee/:employeeId */
router.get('/employee/:employeeId', async (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.employeeId as string, 10);
    if (isNaN(employeeId)) {
      res.status(400).json({ error: 'Invalid employee ID' });
      return;
    }
    const justifications = await queries.getJustificationsByEmployee(employeeId);
    res.json({ justifications });
  } catch (error) {
    console.error('[justifications] Error:', error);
    res.status(500).json({ error: 'Failed to fetch justifications' });
  }
});

/** POST /api/justifications - Submit a justification */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { daily_record_id, employee_id, type, reason, custom_note } = req.body;

    if (!daily_record_id || !employee_id || !type || !reason) {
      res.status(400).json({ error: 'Missing required fields: daily_record_id, employee_id, type, reason' });
      return;
    }

    if (type !== 'late' && type !== 'overtime') {
      res.status(400).json({ error: 'type must be "late" or "overtime"' });
      return;
    }

    await queries.insertJustification(daily_record_id, employee_id, type, reason, custom_note);

    await queries.logAudit('JUSTIFICATION_SUBMITTED', 'justification', undefined,
      `Employee ${employee_id}: ${type} - ${reason}`);

    res.status(201).json({ message: 'Justification submitted' });
  } catch (error) {
    console.error('[justifications] Error submitting:', error);
    res.status(500).json({ error: 'Failed to submit justification' });
  }
});

/** GET /api/justifications/leader/:leaderId/pending?limit=50&offset=0 - Get pending justifications for a leader */
router.get('/leader/:leaderId/pending', async (req: Request, res: Response) => {
  try {
    const leaderId = parseInt(req.params.leaderId as string, 10);
    const { limit, offset } = req.query;

    if (isNaN(leaderId)) {
      res.status(400).json({ error: 'Invalid leader ID' });
      return;
    }

    // Support optional pagination
    const paginationOptions = limit && offset !== undefined
      ? { limit: parseInt(limit as string, 10), offset: parseInt(offset as string, 10) }
      : undefined;

    const result = await queries.getPendingJustificationsByLeader(leaderId, paginationOptions);

    // Return consistent response format
    if (paginationOptions && 'data' in result) {
      res.json({
        justifications: result.data,
        pagination: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
          hasMore: result.hasMore,
        },
      });
    } else {
      res.json({ justifications: result });
    }
  } catch (error) {
    console.error('[justifications] Error fetching pending:', error);
    res.status(500).json({ error: 'Failed to fetch pending justifications' });
  }
});

/** POST /api/justifications/:id/approve - Approve a justification */
router.post('/:id/approve', async (req: Request, res: Response) => {
  try {
    const justificationId = parseInt(req.params.id as string, 10);
    const { reviewedBy, comment } = req.body;

    if (isNaN(justificationId)) {
      res.status(400).json({ error: 'Invalid justification ID' });
      return;
    }

    if (!comment || comment.trim().length === 0) {
      res.status(400).json({ error: 'Comentario obrigatorio ao aprovar' });
      return;
    }

    // Get justification details before updating
    const justification = await queries.getJustificationById(justificationId);
    if (!justification) {
      res.status(404).json({ error: 'Justification not found' });
      return;
    }

    await queries.updateJustificationStatus(justificationId, 'approved', reviewedBy || 'manager', comment);
    await queries.logAudit('JUSTIFICATION_APPROVED', 'justification', justificationId,
      `Approved by ${reviewedBy || 'manager'}: ${comment}`);

    // Send Slack notification to employee
    const employee = await queries.getEmployeeById(justification.employee_id);
    if (employee) {
      await sendJustificationReviewNotification(
        employee.slack_id,
        employee.name,
        justification.date,
        justification.type as 'late' | 'overtime',
        'approved',
        reviewedBy || 'Gestor',
        comment
      );
    }

    res.json({ success: true, message: 'Justificativa aprovada' });
  } catch (error) {
    console.error('[justifications] Error approving:', error);
    res.status(500).json({ error: 'Failed to approve justification' });
  }
});

/** POST /api/justifications/:id/reject - Reject a justification */
router.post('/:id/reject', async (req: Request, res: Response) => {
  try {
    const justificationId = parseInt(req.params.id as string, 10);
    const { reviewedBy, comment } = req.body;

    if (isNaN(justificationId)) {
      res.status(400).json({ error: 'Invalid justification ID' });
      return;
    }

    if (!comment || comment.trim().length === 0) {
      res.status(400).json({ error: 'Comentario obrigatorio ao reprovar' });
      return;
    }

    // Get justification details before updating
    const justification = await queries.getJustificationById(justificationId);
    if (!justification) {
      res.status(404).json({ error: 'Justification not found' });
      return;
    }

    await queries.updateJustificationStatus(justificationId, 'rejected', reviewedBy || 'manager', comment);
    await queries.logAudit('JUSTIFICATION_REJECTED', 'justification', justificationId,
      `Rejected by ${reviewedBy || 'manager'}: ${comment}`);

    // Send Slack notification to employee
    const employee = await queries.getEmployeeById(justification.employee_id);
    if (employee) {
      await sendJustificationReviewNotification(
        employee.slack_id,
        employee.name,
        justification.date,
        justification.type as 'late' | 'overtime',
        'rejected',
        reviewedBy || 'Gestor',
        comment
      );
    }

    res.json({ success: true, message: 'Justificativa rejeitada' });
  } catch (error) {
    console.error('[justifications] Error rejecting:', error);
    res.status(500).json({ error: 'Failed to reject justification' });
  }
});

/** GET /api/justifications/reviewed?limit=100&offset=0 - Get all reviewed justifications (for admin) */
router.get('/reviewed', async (req: Request, res: Response) => {
  try {
    const { limit, offset } = req.query;

    // Support optional pagination
    const paginationOptions = limit && offset !== undefined
      ? { limit: parseInt(limit as string, 10), offset: parseInt(offset as string, 10) }
      : undefined;

    const result = await queries.getReviewedJustifications(paginationOptions);

    // Return consistent response format
    if (paginationOptions && 'data' in result) {
      res.json({
        justifications: result.data,
        pagination: {
          total: result.total,
          limit: result.limit,
          offset: result.offset,
          hasMore: result.hasMore,
        },
      });
    } else {
      res.json({ justifications: result });
    }
  } catch (error) {
    console.error('[justifications] Error fetching reviewed:', error);
    res.status(500).json({ error: 'Failed to fetch reviewed justifications' });
  }
});

/** DELETE /api/justifications/:id - Delete a justification */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const justificationId = parseInt(req.params.id as string, 10);

    if (isNaN(justificationId)) {
      res.status(400).json({ error: 'Invalid justification ID' });
      return;
    }

    const deleted = await queries.deleteJustification(justificationId);
    if (!deleted) {
      res.status(404).json({ error: 'Justification not found' });
      return;
    }

    await queries.logAudit('JUSTIFICATION_DELETED', 'justification', justificationId, 'Deleted');

    res.json({ success: true, message: 'Justificativa removida' });
  } catch (error) {
    console.error('[justifications] Error deleting:', error);
    res.status(500).json({ error: 'Failed to delete justification' });
  }
});

/** DELETE /api/justifications/record/:recordId - Delete justification by daily record ID */
router.delete('/record/:recordId', async (req: Request, res: Response) => {
  try {
    const recordId = parseInt(req.params.recordId as string, 10);

    if (isNaN(recordId)) {
      res.status(400).json({ error: 'Invalid record ID' });
      return;
    }

    const deleted = await queries.deleteJustificationByRecordId(recordId);
    if (!deleted) {
      res.status(404).json({ error: 'Justification not found for this record' });
      return;
    }

    await queries.logAudit('JUSTIFICATION_DELETED', 'justification', recordId, 'Deleted by record ID');

    res.json({ success: true, message: 'Justificativa removida' });
  } catch (error) {
    console.error('[justifications] Error deleting by record:', error);
    res.status(500).json({ error: 'Failed to delete justification' });
  }
});

/** POST /api/justifications/bulk-delete - Delete multiple justifications */
router.post('/bulk-delete', async (req: Request, res: Response) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ error: 'ids array is required' });
      return;
    }

    const deleted = await queries.deleteMultipleJustifications(ids);
    await queries.logAudit('JUSTIFICATIONS_BULK_DELETED', 'justification', undefined, `Deleted ${deleted} justifications`);

    res.json({ success: true, deleted, message: `${deleted} justificativa(s) removida(s)` });
  } catch (error) {
    console.error('[justifications] Error bulk deleting:', error);
    res.status(500).json({ error: 'Failed to delete justifications' });
  }
});

export default router;
