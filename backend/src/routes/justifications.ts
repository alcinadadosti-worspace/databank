import { Router, Request, Response } from 'express';
import * as queries from '../models/queries';
import { logAudit } from '../models/queries';

const router = Router();

/** GET /api/justifications/employee/:employeeId */
router.get('/employee/:employeeId', (req: Request, res: Response) => {
  try {
    const employeeId = parseInt(req.params.employeeId as string, 10);
    if (isNaN(employeeId)) {
      res.status(400).json({ error: 'Invalid employee ID' });
      return;
    }
    const justifications = queries.getJustificationsByEmployee(employeeId);
    res.json({ justifications });
  } catch (error) {
    console.error('[justifications] Error:', error);
    res.status(500).json({ error: 'Failed to fetch justifications' });
  }
});

/** POST /api/justifications - Submit a justification */
router.post('/', (req: Request, res: Response) => {
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

    const record = queries.getDailyRecord(employee_id, '');
    const result = queries.insertJustification(daily_record_id, employee_id, type, reason, custom_note);

    logAudit('JUSTIFICATION_SUBMITTED', 'justification', result.lastInsertRowid as number,
      `Employee ${employee_id}: ${type} - ${reason}`);

    res.status(201).json({ id: result.lastInsertRowid, message: 'Justification submitted' });
  } catch (error) {
    console.error('[justifications] Error submitting:', error);
    res.status(500).json({ error: 'Failed to submit justification' });
  }
});

export default router;
