import { fetchClockPunches } from '../services/solides-api';
import { calculateDailyHours, shouldAlert } from '../services/hours-calculator';
import * as queries from '../models/queries';
import { sendEmployeeAlert } from '../slack/bot';

/**
 * Sync clock punches from Sólides API (READ-ONLY).
 * Calculates hours and triggers alerts when needed.
 *
 * Runs every 5 minutes during work hours.
 */
export async function syncPunches(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  console.log(`[sync] Starting punch sync for ${today}`);

  try {
    const punchData = await fetchClockPunches(today, today);

    if (!punchData || punchData.length === 0) {
      console.log('[sync] No punch data received');
      return;
    }

    const employees = queries.getAllEmployees();
    const employeeMap = new Map<string, typeof employees[0]>();

    // Map by solides_employee_id and by name (fuzzy)
    for (const emp of employees) {
      if (emp.solides_employee_id) {
        employeeMap.set(emp.solides_employee_id, emp);
      }
      employeeMap.set(emp.name.toLowerCase(), emp);
    }

    for (const punch of punchData) {
      // Try to match employee
      let employee = employeeMap.get(punch.employee_id);
      if (!employee && punch.employee_name) {
        employee = employeeMap.get(punch.employee_name.toLowerCase());
      }
      if (!employee) continue;

      // Extract individual punches
      const punches = punch.punches || [];
      const sortedPunches = punches
        .map(p => p.time)
        .filter(Boolean)
        .sort();

      const punchSet = {
        punch1: sortedPunches[0] || null,
        punch2: sortedPunches[1] || null,
        punch3: sortedPunches[2] || null,
        punch4: sortedPunches[3] || null,
      };

      // Calculate hours (only when 4 punches exist)
      const result = calculateDailyHours(punchSet);

      queries.upsertDailyRecord(
        employee.id,
        today,
        punchSet.punch1,
        punchSet.punch2,
        punchSet.punch3,
        punchSet.punch4,
        result?.totalWorkedMinutes ?? null,
        result?.differenceMinutes ?? null,
        result?.classification ?? null
      );

      // Send alert if threshold exceeded and not already sent
      if (result && shouldAlert(result.differenceMinutes)) {
        const record = queries.getDailyRecord(employee.id, today);
        if (record && !record.alert_sent && result.classification !== 'normal') {
          await sendEmployeeAlert(
            employee.slack_id,
            employee.name,
            today,
            result.totalWorkedMinutes,
            result.differenceMinutes,
            result.classification as 'late' | 'overtime',
            record.id
          );
        }
      }
    }

    queries.logAudit('SYNC_COMPLETED', 'system', undefined, `Synced ${punchData.length} records for ${today}`);
    console.log(`[sync] Completed. Processed ${punchData.length} records`);
  } catch (error) {
    console.error('[sync] Error syncing punches:', error);
    queries.logAudit('SYNC_ERROR', 'system', undefined, String(error));
  }
}
