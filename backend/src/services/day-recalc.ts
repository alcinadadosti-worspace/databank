import * as queries from '../models/queries';
import { calculateDailyHoursForEmployee, type PunchSet, type EmployeeScheduleInfo } from './hours-calculator';
import { isLojaSustentavelEmployee, todayInSaoPaulo } from '../config/constants';

export interface DayRecalcResult {
  totalWorkedMinutes: number | null;
  differenceMinutes: number | null;
  classification: string | null;
}

/** Employee data the recalculation needs; `{ id }` alone works for an employee no longer registered. */
export type RecalcEmployee = EmployeeScheduleInfo & { id: number };

/**
 * Recalculates a day after a manual change (gestor/RH edit, adjustment approval,
 * folga/férias change) with the same rules the Sólides sync applies: holidays
 * registered in the panel, vacation, integral folga and partial folga hours.
 * Without this, a manual edit on a partial-folga day turned "Normal" into "Atraso".
 */
export async function recalculateDay(punches: PunchSet, date: string, employee: RecalcEmployee): Promise<DayRecalcResult> {
  const noHours = { totalWorkedMinutes: null, differenceMinutes: null };

  // Loja Sustentável works on Sundays; everyone else follows the holiday calendar
  const isSunday = new Date(date + 'T12:00:00Z').getUTCDay() === 0;
  const workingDay = (isLojaSustentavelEmployee(employee.name) && isSunday) || await queries.isWorkingDayAsync(date);
  if (!workingDay) return { ...noHours, classification: null };

  if ((await queries.getEmployeesOnVacation(date)).has(employee.id)) {
    return { ...noHours, classification: 'ferias' };
  }

  const folga = (await queries.getEmployeesOnFolga(date)).get(employee.id);
  if (folga?.type === 'integral') return { ...noHours, classification: 'folga' };

  const result = calculateDailyHoursForEmployee(punches, date, employee, {
    minutesOff: folga?.type === 'partial' ? folga.hours_off * 60 : 0,
  });
  return {
    totalWorkedMinutes: result?.totalWorkedMinutes ?? null,
    differenceMinutes: result?.differenceMinutes ?? null,
    classification: result?.classification ?? null,
  };
}

/** Classifications the hours calculation produces (as opposed to decisions). */
const COMPUTED = new Set(['normal', 'late', 'overtime']);

/**
 * Re-applies folga/férias to records that already exist in [startDate, endDate]
 * — called when a folga or vacation is created, changed or removed, so a day
 * registered after the fact stops showing "Atraso"/"Sem registro" (and a removed
 * folga stops showing "Folga"). Decisions like Falta/Atestado/Ajuste are kept
 * unless an integral folga or vacation now covers the day.
 * Returns how many records changed.
 */
export async function refreshStoredDays(employeeId: number, startDate: string, endDate: string): Promise<number> {
  const records = await queries.getEmployeeRecordsInRange(employeeId, startDate, endDate);
  if (records.length === 0) return 0;
  const employee: RecalcEmployee = (await queries.getEmployeeById(employeeId)) ?? { id: employeeId };
  const today = todayInSaoPaulo();

  let changed = 0;
  for (const r of records) {
    const calc = await recalculateDay(
      { punch1: r.punch_1, punch2: r.punch_2, punch3: r.punch_3, punch4: r.punch_4 },
      r.date,
      employee
    );

    let next: DayRecalcResult;
    if (calc.classification === 'folga' || calc.classification === 'ferias') {
      next = calc;
    } else if (r.classification === 'folga' || r.classification === 'ferias') {
      // The folga/vacation that justified this day no longer applies. Today is
      // left open (null) for the sync and the 10:00 check to classify — fixing it
      // as "ajuste" now would stick even after the remaining punches arrive.
      const hasPunches = !!(r.punch_1 || r.punch_2 || r.punch_3 || r.punch_4);
      next = calc.classification || r.date >= today
        ? calc
        : { ...calc, classification: hasPunches ? 'ajuste' : 'sem_registro' };
    } else if (!r.classification || COMPUTED.has(r.classification)) {
      if (!calc.classification) continue; // incomplete punches: nothing better to say
      next = calc;
    } else {
      continue; // gestor decision (falta, atestado, ajuste…) stays
    }

    const same = next.classification === (r.classification ?? null)
      && next.totalWorkedMinutes === (r.total_worked_minutes ?? null)
      && next.differenceMinutes === (r.difference_minutes ?? null);
    if (same) continue;

    await queries.updateDailyRecordPunches(
      r.id, r.punch_1, r.punch_2, r.punch_3, r.punch_4,
      next.totalWorkedMinutes, next.differenceMinutes, next.classification
    );
    changed++;
  }
  return changed;
}

/**
 * refreshStoredDays for folga/férias routes: the folga/vacation itself is already
 * saved, so a failure here is logged instead of failing the request.
 */
export async function refreshStoredDaysSafe(employeeId: number, startDate: string, endDate: string): Promise<void> {
  try {
    const changed = await refreshStoredDays(employeeId, startDate, endDate);
    if (changed > 0) console.log(`[day-recalc] employee ${employeeId} ${startDate}..${endDate}: ${changed} record(s) updated`);
  } catch (error) {
    console.error(`[day-recalc] Failed to refresh records for employee ${employeeId} ${startDate}..${endDate}:`, error);
  }
}
