import { fetchPunches, SolidesPunchRecord } from '../services/solides-api';
import { calculateDailyHours, shouldAlert } from '../services/hours-calculator';
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
export async function syncPunches(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
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
    const employees = queries.getAllEmployees();
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
        queries.updateEmployeeSolidesId(employee.id, solidesEmpId);
      }

      // Sort punches by dateIn
      punches.sort((a, b) => a.dateIn - b.dateIn);

      // Extract 4 times from the 2 pairs
      let punch1: string | null = null; // Entrada
      let punch2: string | null = null; // Saida almoco
      let punch3: string | null = null; // Retorno almoco
      let punch4: string | null = null; // Saida final

      if (punches.length >= 1) {
        punch1 = millisToTime(punches[0].dateIn);
        punch2 = punches[0].dateOut ? millisToTime(punches[0].dateOut) : null;
      }
      if (punches.length >= 2) {
        punch3 = millisToTime(punches[1].dateIn);
        punch4 = punches[1].dateOut ? millisToTime(punches[1].dateOut) : null;
      }

      // Calculate only with all 4 punches
      const result = calculateDailyHours({ punch1, punch2, punch3, punch4 });

      queries.upsertDailyRecord(
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
        const record = queries.getDailyRecord(employee.id, date);
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
            queries.markAlertSent(record.id);
            console.log(`[sync] ALERT (no Slack): ${employee.name} - ${result.classification} ${result.differenceMinutes}min`);
          }
        }
      }

      processed++;
    }

    queries.logAudit('SYNC_COMPLETED', 'system', undefined,
      `Synced ${punchData.length} punches for ${processed} employees on ${today}`);
    console.log(`[sync] Completed. ${punchData.length} punches, ${processed} employees`);
  } catch (error) {
    console.error('[sync] Error syncing punches:', error);
    queries.logAudit('SYNC_ERROR', 'system', undefined, String(error));
  }
}
