import { fetchPunches, SolidesPunchRecord } from '../services/solides-api';
import { shouldAlert, CalculationResult } from '../services/hours-calculator';
import { WORK_SCHEDULE, HourClassification } from '../config/constants';
import * as queries from '../models/queries';
import { sendEmployeeAlert } from '../slack/bot';
import { env } from '../config/env';

/**
 * Convert epoch milliseconds to "HH:MM" time string (Sao Paulo -3).
 */
function millisToTime(millis: number): string {
  const date = new Date(millis);
  // Tangerino stores in UTC, display in Sao Paulo (-3)
  const hours = date.getUTCHours() - 3;
  const adjustedHours = hours < 0 ? hours + 24 : hours;
  const minutes = date.getUTCMinutes();
  return `${String(adjustedHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * Sync clock punches from Sólides API (READ-ONLY).
 *
 * Tangerino structure: each record = 1 entry/exit pair.
 * A full day = 2 records (morning + afternoon).
 *
 * Record 1: dateIn = entrada, dateOut = saida almoco
 * Record 2: dateIn = retorno almoco, dateOut = saida final
 */
export async function syncPunches(targetDate?: string): Promise<void> {
  const today = targetDate || new Date().toISOString().split('T')[0];
  console.log(`[sync] Starting punch sync for ${today}`);

  try {
    const punchData = await fetchPunches(today, today);

    if (!punchData || punchData.length === 0) {
      console.log('[sync] No punch data received');
      return;
    }

    // Group punches by employee + date
    const grouped = new Map<string, SolidesPunchRecord[]>();
    for (const punch of punchData) {
      const key = `${punch.employeeId}_${punch.date}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(punch);
    }

    // Get all employees for matching
    const employees = await queries.getAllEmployees();
    const employeeBySolidesId = new Map<string, typeof employees[0]>();
    const employeeByName = new Map<string, typeof employees[0]>();

    for (const emp of employees) {
      if (emp.solides_employee_id) {
        employeeBySolidesId.set(emp.solides_employee_id, emp);
      }
      employeeByName.set(emp.name.toLowerCase().trim(), emp);
    }

    let processed = 0;

    for (const [key, punches] of grouped) {
      const [solidesEmpId, date] = key.split('_');
      const firstPunch = punches[0];

      // Match employee
      let employee = employeeBySolidesId.get(solidesEmpId);
      if (!employee && firstPunch.employeeName) {
        employee = employeeByName.get(firstPunch.employeeName.toLowerCase().trim());
      }
      if (!employee) continue;

      // Link Sólides ID if not yet linked
      if (!employee.solides_employee_id) {
        await queries.updateEmployeeSolidesId(employee.id, solidesEmpId);
      }

      // Collect all individual timestamps from all records
      const allTimestamps: number[] = [];
      for (const p of punches) {
        if (p.dateIn) allTimestamps.push(p.dateIn);
        if (p.dateOut) allTimestamps.push(p.dateOut);
      }

      // Sort chronologically and deduplicate
      const uniqueTimes = [...new Set(allTimestamps)].sort((a, b) => a - b);

      // Assign to punch1-4 in chronological order
      const punch1 = uniqueTimes[0] ? millisToTime(uniqueTimes[0]) : null; // Entrada
      const punch2 = uniqueTimes[1] ? millisToTime(uniqueTimes[1]) : null; // Saida almoco
      const punch3 = uniqueTimes[2] ? millisToTime(uniqueTimes[2]) : null; // Retorno almoco
      const punch4 = uniqueTimes[3] ? millisToTime(uniqueTimes[3]) : null; // Saida final

      // Calculate using epoch millis from API records (handles cross-midnight)
      // Apprentices only need 1 complete pair; regular employees need 2
      const isApprentice = employee.is_apprentice === true;
      const expectedMinutes = isApprentice
        ? (employee.expected_daily_minutes || 240)
        : WORK_SCHEDULE.EXPECTED_DAILY_MINUTES;
      const minPairs = isApprentice ? 1 : 2;

      let result: CalculationResult | null = null;
      const completePairs = punches.filter(p => p.dateIn && p.dateOut);
      if (completePairs.length >= minPairs) {
        completePairs.sort((a, b) => a.dateIn - b.dateIn);
        let totalMs = 0;
        for (const pair of completePairs) {
          totalMs += pair.dateOut! - pair.dateIn;
        }
        const totalWorkedMinutes = Math.round(totalMs / 60000);
        const differenceMinutes = totalWorkedMinutes - expectedMinutes;
        let classification: HourClassification;
        if (Math.abs(differenceMinutes) <= WORK_SCHEDULE.TOLERANCE_MINUTES) {
          classification = 'normal';
        } else if (differenceMinutes < 0) {
          classification = 'late';
        } else {
          classification = 'overtime';
        }
        result = { totalWorkedMinutes, differenceMinutes, classification, isComplete: true };
      }

      await queries.upsertDailyRecord(
        employee.id,
        date,
        punch1,
        punch2,
        punch3,
        punch4,
        result?.totalWorkedMinutes ?? null,
        result?.differenceMinutes ?? null,
        result?.classification ?? null
      );

      // Send alert if threshold exceeded
      if (result && shouldAlert(result.differenceMinutes) && result.classification !== 'normal') {
        const record = await queries.getDailyRecord(employee.id, date);
        if (record && !record.alert_sent) {
          // Only send if Slack is configured
          if (env.SLACK_BOT_TOKEN && env.SLACK_BOT_TOKEN.startsWith('xoxb-')) {
            await sendEmployeeAlert(
              employee.slack_id,
              employee.name,
              date,
              result.totalWorkedMinutes,
              result.differenceMinutes,
              result.classification as 'late' | 'overtime',
              record.id
            );
          } else {
            // Mark alert as sent anyway to avoid re-processing
            await queries.markAlertSent(record.id);
            console.log(`[sync] ALERT (no Slack): ${employee.name} - ${result.classification} ${result.differenceMinutes}min`);
          }
        }
      }

      processed++;
    }

    await queries.logAudit('SYNC_COMPLETED', 'system', undefined,
      `Synced ${punchData.length} punches for ${processed} employees on ${today}`);
    console.log(`[sync] Completed. ${punchData.length} punches, ${processed} employees`);
  } catch (error) {
    console.error('[sync] Error syncing punches:', error);
    await queries.logAudit('SYNC_ERROR', 'system', undefined, String(error));
  }
}
