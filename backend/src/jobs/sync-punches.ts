import { fetchPunches, SolidesPunchRecord } from '../services/solides-api';
import { shouldAlert, CalculationResult, calculateDailyHoursForEmployee } from '../services/hours-calculator';
import { WORK_SCHEDULE, HourClassification, isSaturday, getExpectedMinutes, isLojaSustentavelEmployee, getLojaSustentavelExpectedMinutes, isNoLunchEmployee } from '../config/constants';
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

export interface SyncOptions {
  skipNotifications?: boolean;
}

type PrevRecord = {
  punch_1: string | null; punch_2: string | null; punch_3: string | null; punch_4: string | null;
  total_worked_minutes: number | null; difference_minutes: number | null; classification: string | null;
};

/**
 * Calls upsertDailyRecord only when it would actually modify the stored record,
 * mirroring its null-preserve semantics (a null never overwrites a stored value).
 * The sync runs every 5 minutes and most records change only a few times a day,
 * so skipping no-op upserts avoids one Firestore read + one write per employee/run.
 * Returns true when a write happened.
 */
async function upsertIfChanged(
  prev: PrevRecord | undefined,
  employeeId: number,
  date: string,
  punch1: string | null, punch2: string | null, punch3: string | null, punch4: string | null,
  totalWorkedMinutes: number | null, differenceMinutes: number | null, classification: string | null
): Promise<boolean> {
  if (prev) {
    const unchanged =
      (punch1 ?? prev.punch_1 ?? null) === (prev.punch_1 ?? null) &&
      (punch2 ?? prev.punch_2 ?? null) === (prev.punch_2 ?? null) &&
      (punch3 ?? prev.punch_3 ?? null) === (prev.punch_3 ?? null) &&
      (punch4 ?? prev.punch_4 ?? null) === (prev.punch_4 ?? null) &&
      (totalWorkedMinutes ?? prev.total_worked_minutes ?? null) === (prev.total_worked_minutes ?? null) &&
      (differenceMinutes ?? prev.difference_minutes ?? null) === (prev.difference_minutes ?? null) &&
      (classification ?? prev.classification ?? null) === (prev.classification ?? null);
    if (unchanged) return false;
  }
  await queries.upsertDailyRecord(
    employeeId, date, punch1, punch2, punch3, punch4,
    totalWorkedMinutes, differenceMinutes, classification
  );
  return true;
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
export async function syncPunches(targetDate?: string, options?: SyncOptions): Promise<void> {
  const skipNotifications = options?.skipNotifications ?? false;
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

    // Get folgas for today (fetched once, used per employee)
    const onFolga = await queries.getEmployeesOnFolga(today);

    // Existing records for the day — needed to preserve manually corrected punches
    const existingRecords = await queries.getDailyRecordsByDate(today);
    const existingByEmployee = new Map(existingRecords.map(r => [r.employee_id, r]));

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
    let changed = 0;

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
      let punch1 = uniqueTimes[0] ? millisToTime(uniqueTimes[0]) : null; // Entrada
      let punch2 = uniqueTimes[1] ? millisToTime(uniqueTimes[1]) : null; // Saida almoco
      let punch3 = uniqueTimes[2] ? millisToTime(uniqueTimes[2]) : null; // Retorno almoco
      let punch4 = uniqueTimes[3] ? millisToTime(uniqueTimes[3]) : null; // Saida final

      // Manually corrected fields (admin/manager edit, approved adjustment) win
      // over Sólides data — otherwise every 5-min sync would silently revert them.
      const existing = existingByEmployee.get(employee.id);
      const manualFields = new Set<string>(
        existing && existing.date === date ? existing.manual_punches ?? [] : []
      );
      if (manualFields.has('punch_1')) punch1 = existing!.punch_1;
      if (manualFields.has('punch_2')) punch2 = existing!.punch_2;
      if (manualFields.has('punch_3')) punch3 = existing!.punch_3;
      if (manualFields.has('punch_4')) punch4 = existing!.punch_4;

      // Stored record for this exact date, used to skip no-op writes below
      const prevRecord = existing && existing.date === date ? existing : undefined;

      const isLojasSustentavel = isLojaSustentavelEmployee(employee.name);
      const isNoLunch = isNoLunchEmployee(employee.name);
      const isSundayDate = new Date(date + 'T12:00:00Z').getUTCDay() === 0;

      // Skip non-working days (Loja Sustentável employees work on Sundays)
      const workingDay = (isLojasSustentavel && isSundayDate)
        ? true
        : await queries.isWorkingDayAsync(date);
      if (!workingDay) {
        // Still save the punches but don't calculate/classify
        if (await upsertIfChanged(prevRecord, employee.id, date, punch1, punch2, punch3, punch4, null, null, null)) changed++;
        processed++;
        continue;
      }

      // Skip integral folga — save punches but classify as folga, no alerts
      const folgaRecord = onFolga.get(employee.id);
      if (folgaRecord?.type === 'integral') {
        if (await upsertIfChanged(prevRecord, employee.id, date, punch1, punch2, punch3, punch4, null, null, 'folga')) changed++;
        processed++;
        continue;
      }

      // Calculate using epoch millis from API records (handles cross-midnight)
      // Saturday: only need 1 pair, Apprentices: custom schedule
      // Loja Sustentável: 1 pair, Mon-Sat 720 min, Sun 660 min
      const isApprentice = employee.is_apprentice === true;
      const isSat = isSaturday(date);

      // Get expected minutes; reduce for partial folga
      let expectedMinutes: number;
      if (isLojasSustentavel) {
        expectedMinutes = getLojaSustentavelExpectedMinutes(date);
      } else {
        expectedMinutes = getExpectedMinutes(date, isApprentice, employee.expected_daily_minutes || 240, employee.name, employee.schedule_overrides);
      }
      if (folgaRecord?.type === 'partial') {
        expectedMinutes = Math.max(0, expectedMinutes - (folgaRecord.hours_off * 60));
      }

      // Saturday, apprentices, Loja Sustentável, and no-lunch employees only need 1 complete pair; regular weekdays need 2
      const minPairs = (isSat || isApprentice || isLojasSustentavel || isNoLunch) ? 1 : 2;

      let result: CalculationResult | null = null;
      if (manualFields.size > 0) {
        // Epoch pairs from Sólides no longer reflect the stored punches after a
        // manual correction — recalculate from the merged punch strings, exactly
        // like the edit endpoints do, so the numbers never flip back and forth.
        result = calculateDailyHoursForEmployee(
          { punch1, punch2, punch3, punch4 },
          date,
          employee
        );
      } else {
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
      }

      if (await upsertIfChanged(
        prevRecord, employee.id, date, punch1, punch2, punch3, punch4,
        result?.totalWorkedMinutes ?? null,
        result?.differenceMinutes ?? null,
        result?.classification ?? null
      )) changed++;

      // Send alert if threshold exceeded (skip if silent sync).
      // no_punch_required employees are off the punch radar: keep saving their
      // record for hours tracking, but never alert them even if Sólides has punches.
      if (!skipNotifications && !employee.no_punch_required && !prevRecord?.alert_sent && result && shouldAlert(result.differenceMinutes) && result.classification !== 'normal') {
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

    // Only write an audit entry when something actually changed — the sync runs
    // every 5 minutes and no-op entries just grow the audit collection.
    if (changed > 0) {
      await queries.logAudit('SYNC_COMPLETED', 'system', undefined,
        `Synced ${punchData.length} punches for ${processed} employees (${changed} updated) on ${today}`);
    }
    console.log(`[sync] Completed. ${punchData.length} punches, ${processed} employees, ${changed} updated`);
  } catch (error) {
    console.error('[sync] Error syncing punches:', error);
    await queries.logAudit('SYNC_ERROR', 'system', undefined, String(error));
  }
}
