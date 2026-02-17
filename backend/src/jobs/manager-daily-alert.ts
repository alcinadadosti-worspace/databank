import * as queries from '../models/queries';
import { sendManagerWeeklySummary, sendNoRecordNotification, sendMissingPunchNotification, sendLateStartNotification, sendLatePunchNotification } from '../slack/bot';
import { WORK_SCHEDULE } from '../config/constants';

/**
 * Check previous day's records for issues and send appropriate notifications.
 * This runs at 08:00 Mon-Sat.
 * - Sends notifications to EMPLOYEES about missing punches, late starts
 * - Sends notifications to MANAGERS only for "no record" decisions (folga/falta/aparelho)
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

      // Case 3: First punch after 10:00 (regular employees only) → ajuste, notify employee
      if (!employee.is_apprentice && record?.punch_1 && record.punch_1 > '10:00') {
        await queries.updateRecordClassification(record.id, 'ajuste');
        await sendLateStartNotification(employee, record, date);
        continue;
      }

      // Case 4: Any non-last punch after 17:00 → ajuste, notify employee
      // For weekdays: check punch_1, punch_2, punch_3 (punch_4 is the last)
      // For Saturdays: check punch_1 (punch_2 is the last)
      if (record) {
        const punchesBeforeLast = isSaturday
          ? [record.punch_1]
          : [record.punch_1, record.punch_2, record.punch_3];

        const latePunch = punchesBeforeLast.find(p => p && p > '17:00');
        if (latePunch) {
          await queries.updateRecordClassification(record.id, 'ajuste');
          await sendLatePunchNotification(employee, record, date, latePunch);
          continue;
        }
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
 * Run daily checks at 08:00 Mon-Sat.
 * Only sends notifications to employees (missing punches, late starts).
 * Manager "no record" decisions are still sent daily.
 */
export async function runDailyChecks(): Promise<void> {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const date = yesterday.toISOString().split('T')[0];

  // Skip if yesterday was not a working day (Sunday or holiday)
  const workingDay = await queries.isWorkingDayAsync(date);
  if (!workingDay) {
    console.log(`[daily-check] Skipping ${date} - not a working day`);
    return;
  }

  // Run the end-of-day checks (sends notifications to employees and managers for no-record)
  await checkPreviousDayRecords();
  console.log(`[daily-check] Completed for ${date}`);
}

/**
 * Send weekly summary to managers every Friday at 08:00.
 * Includes all records from Mon-Thu of current week + Fri-Sat of previous week.
 */
export async function sendWeeklyManagerAlerts(): Promise<void> {
  console.log('[weekly-alert] Starting weekly manager summary');

  try {
    // Calculate date range: last 7 days (Mon-Sat of the past week ending today)
    const today = new Date();
    const dates: string[] = [];

    // Go back 7 days to cover the full work week
    for (let i = 1; i <= 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayOfWeek = d.getDay();

      // Skip Sundays (0)
      if (dayOfWeek !== 0) {
        const isWorkingDay = await queries.isWorkingDayAsync(dateStr);
        if (isWorkingDay) {
          dates.push(dateStr);
        }
      }
    }

    if (dates.length === 0) {
      console.log('[weekly-alert] No working days in the past week');
      return;
    }

    dates.sort(); // Sort chronologically
    console.log(`[weekly-alert] Collecting records for dates: ${dates.join(', ')}`);

    // Collect all records for the week
    const allRecords: queries.DailyRecord[] = [];
    for (const date of dates) {
      const records = await queries.getDailyRecordsByDate(date);
      allRecords.push(...records);
    }

    if (allRecords.length === 0) {
      console.log('[weekly-alert] No records for the past week');
      return;
    }

    // Group records by leader
    const byLeader = new Map<number, {
      leaderName: string;
      leaderSlackId: string | null;
      records: typeof allRecords;
    }>();

    for (const record of allRecords) {
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

    // Send weekly summary to each leader
    for (const [_leaderId, data] of byLeader) {
      await sendManagerWeeklySummary(
        data.leaderSlackId,
        data.leaderName,
        dates[0], // start date
        dates[dates.length - 1], // end date
        data.records.map(r => ({
          employee_name: (r as any).employee_name,
          date: r.date,
          classification: r.classification || 'normal',
          difference_minutes: r.difference_minutes || 0,
          justification_reason: (r as any).justification_reason,
        }))
      );
    }

    await queries.logAudit('MANAGER_WEEKLY_ALERTS_SENT', 'system', undefined, `Week ending ${dates[dates.length - 1]}`);
    console.log(`[weekly-alert] Completed for week ending ${dates[dates.length - 1]}`);
  } catch (error) {
    console.error('[weekly-alert] Error:', error);
    await queries.logAudit('MANAGER_WEEKLY_ALERT_ERROR', 'system', undefined, String(error));
  }
}

// Keep backwards compatibility alias
export const sendDailyManagerAlerts = runDailyChecks;
