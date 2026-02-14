import * as queries from '../models/queries';
import { sendManagerDailySummary, sendNoRecordNotification, sendMissingPunchNotification, sendLateStartNotification } from '../slack/bot';
import { WORK_SCHEDULE } from '../config/constants';

/**
 * Check previous day's records for issues and send appropriate notifications.
 * This runs at 08:00 along with manager daily alerts.
 */
export async function checkPreviousDayRecords(): Promise<void> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const date = yesterday.toISOString().split('T')[0];
  const dateObj = new Date(date + 'T12:00:00Z');
  const isSaturday = dateObj.getUTCDay() === 6;

  console.log(`[end-of-day-check] Checking records for ${date} (Saturday: ${isSaturday})`);

  try {
    const allEmployees = await queries.getAllEmployees();
    const records = await queries.getDailyRecordsByDate(date);
    const recordsByEmpId = new Map(records.map(r => [r.employee_id, r]));

    for (const employee of allEmployees) {
      // Skip employees who don't punch
      if (employee.no_punch_required) continue;

      // Check if employee should work on this day
      const shouldWork = await queries.isWorkingDayForEmployee(date, employee);
      if (!shouldWork) {
        // If they have a record anyway, mark it as folga
        const record = recordsByEmpId.get(employee.id);
        if (record && !record.classification) {
          await queries.updateRecordClassification(record.id, 'folga');
        }
        continue;
      }

      const record = recordsByEmpId.get(employee.id);
      const punchCount = countPunches(record);
      const expectedPunches = getExpectedPunches(isSaturday, employee);

      // Case 1: No record or no punches → sem_registro, notify manager
      if (punchCount === 0) {
        if (record) {
          await queries.updateRecordClassification(record.id, 'sem_registro');
        }
        await sendNoRecordNotification(employee, date);
        continue;
      }

      // Case 2: Incomplete punches → ajuste, notify employee
      if (punchCount < expectedPunches) {
        if (record) {
          await queries.updateRecordClassification(record.id, 'ajuste');
          const missingPunches = getMissingPunches(record, isSaturday);
          await sendMissingPunchNotification(employee, record, date, missingPunches);
        }
        continue;
      }

      // Case 3: First punch after 12:00 (regular employees only) → ajuste, notify employee
      if (!employee.is_apprentice && record?.punch_1 && record.punch_1 > '12:00') {
        await queries.updateRecordClassification(record.id, 'ajuste');
        await sendLateStartNotification(employee, record, date);
        continue;
      }
    }

    console.log(`[end-of-day-check] Completed for ${date}`);
  } catch (error) {
    console.error('[end-of-day-check] Error:', error);
    await queries.logAudit('END_OF_DAY_CHECK_ERROR', 'system', undefined, String(error));
  }
}

function countPunches(record: queries.DailyRecord | undefined): number {
  if (!record) return 0;
  return [record.punch_1, record.punch_2, record.punch_3, record.punch_4].filter(Boolean).length;
}

function getExpectedPunches(isSaturday: boolean, employee: queries.EmployeeWithLeader): number {
  if (employee.is_apprentice) return 2; // Apprentices only punch in/out
  return isSaturday ? 2 : 4;
}

function getMissingPunches(record: queries.DailyRecord, isSaturday: boolean): string[] {
  const missing: string[] = [];
  if (!record.punch_1) missing.push('Entrada');
  if (isSaturday) {
    if (!record.punch_2) missing.push('Saída');
  } else {
    if (!record.punch_2) missing.push('Intervalo');
    if (!record.punch_3) missing.push('Retorno');
    if (!record.punch_4) missing.push('Saída');
  }
  return missing;
}

/**
 * Send daily summary to managers every day at 08:00.
 * Always refers to the PREVIOUS day.
 * Skips if previous day was a holiday or Sunday.
 */
export async function sendDailyManagerAlerts(): Promise<void> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const date = yesterday.toISOString().split('T')[0];

  // Skip if yesterday was not a working day (Sunday or holiday - checks database)
  const workingDay = await queries.isWorkingDayAsync(date);
  if (!workingDay) {
    console.log(`[daily-alert] Skipping ${date} - not a working day`);
    return;
  }

  // First run the end-of-day checks
  await checkPreviousDayRecords();

  console.log(`[daily-alert] Sending manager alerts for ${date}`);

  try {
    const records = await queries.getDailyRecordsByDate(date);

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

    await queries.markManagerAlertSent(date);
    await queries.logAudit('MANAGER_ALERTS_SENT', 'system', undefined, `Alerts for ${date}`);
    console.log(`[daily-alert] Completed for ${date}`);
  } catch (error) {
    console.error('[daily-alert] Error:', error);
    await queries.logAudit('MANAGER_ALERT_ERROR', 'system', undefined, String(error));
  }
}
