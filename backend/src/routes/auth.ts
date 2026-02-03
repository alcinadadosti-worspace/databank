import { Router, Request, Response } from 'express';
import * as queries from '../models/queries';

const router = Router();

/**
 * POST /api/auth/identify - Identify user by Slack ID
 * Returns user role and associated data.
 */
router.post('/identify', async (req: Request, res: Response) => {
  try {
    const { slack_id } = req.body;
    if (!slack_id) {
      res.status(400).json({ error: 'slack_id required' });
      return;
    }

    // Check if user exists
    let user = await queries.getUserBySlackId(slack_id);
    if (user) {
      res.json({ user });
      return;
    }

    // Try to find as employee
    const employee = await queries.getEmployeeBySlackId(slack_id);
    if (employee) {
      await queries.upsertUser(slack_id, employee.name, 'employee', employee.id, undefined);
      user = await queries.getUserBySlackId(slack_id);
      res.json({ user });
      return;
    }

    // Try to find as leader
    const leader = await queries.getLeaderBySlackId(slack_id);
    if (leader) {
      await queries.upsertUser(slack_id, leader.name, 'manager', undefined, leader.id);
      user = await queries.getUserBySlackId(slack_id);
      res.json({ user });
      return;
    }

    res.status(404).json({ error: 'User not found in the system' });
  } catch (error) {
    console.error('[auth] Error identifying user:', error);
    res.status(500).json({ error: 'Failed to identify user' });
  }
});

export default router;
