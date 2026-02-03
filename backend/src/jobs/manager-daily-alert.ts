import * as queries from '../models/queries';
import { sendManagerDailySummary } from '../slack/bot';

/**
 * Send daily summary to managers every day at 08:00.
 * Always refers to the PREVIOUS day.
 */
export async function sendDailyManagerAlerts(): Promise<void> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const date = yesterday.toISOString().split('T')[0];

  console.log(`[daily-alert] Sending manager alerts for ${date}`);

  try {
    const records = queries.getDailyRecordsByDate(date);

    if (!records || records.length === 0) {
      console.log('[daily-alert] No records for yesterday');
      return;
    }

    // Group records by leader
    const byLeader = new Map<number, {
      leaderName: string;
      leaderSlackId: string | null;
      records: typeof records;
    }>();

    for (const record of records) {
      const leaderId = (record as any).leader_id;
      if (!byLeader.has(leaderId)) {
        byLeader.set(leaderId, {
          leaderName: (record as any).leader_name,
          leaderSlackId: (record as any).leader_slack_id,
          records: [],
        });
      }
      byLeader.get(leaderId)!.records.push(record);
    }

    // Send summary to each leader
    for (const [_leaderId, data] of byLeader) {
      await sendManagerDailySummary(
        data.leaderSlackId,
        data.leaderName,
        date,
        data.records.map(r => ({
          employee_name: (r as any).employee_name,
          classification: r.classification || 'normal',
          difference_minutes: r.difference_minutes || 0,
          justification_reason: (r as any).justification_reason,
        }))
      );
    }

    queries.markManagerAlertSent(date);
    queries.logAudit('MANAGER_ALERTS_SENT', 'system', undefined, `Alerts for ${date}`);
    console.log(`[daily-alert] Completed for ${date}`);
  } catch (error) {
    console.error('[daily-alert] Error:', error);
    queries.logAudit('MANAGER_ALERT_ERROR', 'system', undefined, String(error));
  }
}
