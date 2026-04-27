import * as queries from '../models/queries';
import { sendPunchReminder } from '../slack/bot';
import { isSaturday, EXTENDED_SATURDAY_EMPLOYEES, isLojaSustentavelEmployee } from '../config/constants';

// Cache of employees on vacation for the current day
let vacationEmployeesCache: Set<number> | null = null;
let vacationCacheDate = '';

async function getEmployeesOnVacation(): Promise<Set<number>> {
  const today = new Date().toISOString().split('T')[0];
  if (vacationCacheDate !== today || !vacationEmployeesCache) {
    vacationEmployeesCache = await queries.getEmployeesOnVacation(today);
    vacationCacheDate = today;
  }
  return vacationEmployeesCache;
}

// Cache of employees on integral folga for the current day
let folgaCache: Map<number, queries.Folga> | null = null;
let folgaCacheDate = '';

async function getEmployeesOnIntegralFolga(): Promise<Set<number>> {
  const today = new Date().toISOString().split('T')[0];
  if (folgaCacheDate !== today || !folgaCache) {
    folgaCache = await queries.getEmployeesOnFolga(today);
    folgaCacheDate = today;
  }
  const integralIds = new Set<number>();
  for (const [empId, folga] of folgaCache) {
    if (folga.type === 'integral') integralIds.add(empId);
  }
  return integralIds;
}

// Track which reminders have been sent today (resets daily)
// Format: "YYYY-MM-DD:employeeId:type"
const sentReminders = new Set<string>();
let lastResetDate = '';

function resetIfNewDay(): void {
  const today = new Date().toISOString().split('T')[0];
  if (today !== lastResetDate) {
    sentReminders.clear();
    lastResetDate = today;
    console.log('[reminders] Reset reminder tracking for new day');
  }
}

function hasReminderBeenSent(employeeId: number, type: string): boolean {
  const today = new Date().toISOString().split('T')[0];
  return sentReminders.has(`${today}:${employeeId}:${type}`);
}

function markReminderSent(employeeId: number, type: string): void {
  const today = new Date().toISOString().split('T')[0];
  sentReminders.add(`${today}:${employeeId}:${type}`);
}

/**
 * Send entry reminder at 7:50 AM.
 * Reminds employees who haven't punched in yet.
 * Each employee receives only ONE entry reminder per day.
 */
export async function sendEntryReminders(): Promise<void> {
  resetIfNewDay();
  const today = new Date().toISOString().split('T')[0];

  // Skip non-working days (checks both static and database holidays)
  const workingDay = await queries.isWorkingDayAsync(today);
  if (!workingDay) {
    console.log('[reminders] Skipping entry reminder - not a working day');
    return;
  }

  console.log('[reminders] Sending entry reminders (10 min before 8:00)');

  try {
    const employees = await queries.getAllEmployees();
    const records = await queries.getDailyRecordsByDate(today);
    const punchedIds = new Set(records.map(r => r.employee_id));
    const onVacation = await getEmployeesOnVacation();
    const onIntegralFolga = await getEmployeesOnIntegralFolga();

    const todayDow = new Date().getUTCDay(); // 0=Sun, 2=Tue, etc.

    // Send to employees who haven't punched yet
    let sent = 0;
    for (const emp of employees) {
      // Skip if already punched, no punch required, already reminded, or on vacation/folga
      if (punchedIds.has(emp.id) || emp.no_punch_required) continue;
      if (hasReminderBeenSent(emp.id, 'entry')) continue;
      if (onVacation.has(emp.id)) continue;
      if (onIntegralFolga.has(emp.id)) continue;
      if (emp.exemption_days && emp.exemption_days.includes(todayDow)) continue;
      // Loja Sustentável employees start at 09:00, not 08:00 — skip standard 07:50 reminder
      if (isLojaSustentavelEmployee(emp.name)) continue;

      await sendPunchReminder(emp.slack_id, emp.name, 'entry', 10);
      markReminderSent(emp.id, 'entry');
      sent++;
    }

    console.log(`[reminders] Entry reminders sent to ${sent} employees`);
  } catch (error) {
    console.error('[reminders] Error sending entry reminders:', error);
  }
}

/**
 * Send exit reminder at 17:50 PM.
 * Reminds employees who haven't punched out yet.
 * Each employee receives only ONE exit reminder per day.
 */
export async function sendExitReminders(): Promise<void> {
  resetIfNewDay();
  const today = new Date().toISOString().split('T')[0];

  // Skip non-working days (checks both static and database holidays)
  const workingDay = await queries.isWorkingDayAsync(today);
  if (!workingDay) {
    console.log('[reminders] Skipping exit reminder - not a working day');
    return;
  }

  // Skip Saturday (no exit reminder, they leave at 12:00)
  if (isSaturday(today)) {
    console.log('[reminders] Skipping exit reminder - Saturday');
    return;
  }

  console.log('[reminders] Sending exit reminders (10 min before 18:00)');

  try {
    const employees = await queries.getAllEmployees();
    const records = await queries.getDailyRecordsByDate(today);
    const onVacation = await getEmployeesOnVacation();
    const onIntegralFolga = await getEmployeesOnIntegralFolga();

    // Create map of employee records
    const recordMap = new Map(records.map(r => [r.employee_id, r]));

    // Send to employees who have punch_3 but not punch_4 (didn't punch out yet)
    let sent = 0;
    for (const emp of employees) {
      if (emp.no_punch_required || emp.is_apprentice || emp.is_intern) continue;
      if (hasReminderBeenSent(emp.id, 'exit')) continue;
      if (onVacation.has(emp.id)) continue;
      if (onIntegralFolga.has(emp.id)) continue;
      // Loja Sustentável employees exit at 21:00, not 18:00 — skip standard 17:50 reminder
      if (isLojaSustentavelEmployee(emp.name)) continue;

      const record = recordMap.get(emp.id);
      // Has returned from lunch but hasn't left yet
      if (record && record.punch_3 && !record.punch_4) {
        await sendPunchReminder(emp.slack_id, emp.name, 'exit', 10);
        markReminderSent(emp.id, 'exit');
        sent++;
      }
    }

    console.log(`[reminders] Exit reminders sent to ${sent} employees`);
  } catch (error) {
    console.error('[reminders] Error sending exit reminders:', error);
  }
}

/**
 * Send Saturday exit reminder at 11:50 AM.
 * Reminds employees who haven't punched out yet on Saturday.
 * Each employee receives only ONE exit reminder per day.
 */
export async function sendSaturdayExitReminders(): Promise<void> {
  resetIfNewDay();
  const today = new Date().toISOString().split('T')[0];

  // Only run on Saturday
  if (!isSaturday(today)) {
    return;
  }

  console.log('[reminders] Sending Saturday exit reminders (10 min before 12:00) — standard units');

  try {
    const employees = await queries.getAllEmployees();
    const records = await queries.getDailyRecordsByDate(today);
    const onVacation = await getEmployeesOnVacation();
    const onIntegralFolga = await getEmployeesOnIntegralFolga();

    const recordMap = new Map(records.map(r => [r.employee_id, r]));

    // Send only to employees whose unit ends at 12:00 (not the 14:00 units)
    let sent = 0;
    for (const emp of employees) {
      if (emp.no_punch_required) continue;
      if (hasReminderBeenSent(emp.id, 'exit_saturday')) continue;
      if (onVacation.has(emp.id)) continue;
      if (onIntegralFolga.has(emp.id)) continue;
      // Skip employees with extended Saturday hours (they get their reminder at 13:50)
      if (EXTENDED_SATURDAY_EMPLOYEES.has(emp.name.toLowerCase())) continue;
      // Loja Sustentável employees exit at 21:00 on Saturday — not covered by this reminder
      if (isLojaSustentavelEmployee(emp.name)) continue;

      const record = recordMap.get(emp.id);
      if (record && record.punch_1 && !record.punch_2) {
        await sendPunchReminder(emp.slack_id, emp.name, 'exit', 10);
        markReminderSent(emp.id, 'exit_saturday');
        sent++;
      }
    }

    console.log(`[reminders] Saturday exit reminders sent to ${sent} employees`);
  } catch (error) {
    console.error('[reminders] Error sending Saturday exit reminders:', error);
  }
}

/**
 * Send Saturday exit reminder at 13:50 for units that work until 14:00.
 * (e.g. Loja Palmeira dos Indios, Loja Penedo)
 */
export async function sendSaturdayLateExitReminders(): Promise<void> {
  resetIfNewDay();
  const today = new Date().toISOString().split('T')[0];

  if (!isSaturday(today)) {
    return;
  }

  console.log('[reminders] Sending Saturday exit reminders (10 min before 14:00) — extended units');

  try {
    const employees = await queries.getAllEmployees();
    const records = await queries.getDailyRecordsByDate(today);
    const onVacation = await getEmployeesOnVacation();
    const onIntegralFolga = await getEmployeesOnIntegralFolga();

    const recordMap = new Map(records.map(r => [r.employee_id, r]));

    let sent = 0;
    for (const emp of employees) {
      if (emp.no_punch_required) continue;
      if (hasReminderBeenSent(emp.id, 'exit_saturday')) continue;
      if (onVacation.has(emp.id)) continue;
      if (onIntegralFolga.has(emp.id)) continue;
      // Only employees with extended Saturday hours
      if (!EXTENDED_SATURDAY_EMPLOYEES.has(emp.name.toLowerCase())) continue;

      const record = recordMap.get(emp.id);
      if (record && record.punch_1 && !record.punch_2) {
        await sendPunchReminder(emp.slack_id, emp.name, 'exit', 10);
        markReminderSent(emp.id, 'exit_saturday');
        sent++;
      }
    }

    console.log(`[reminders] Saturday late exit reminders sent to ${sent} employees`);
  } catch (error) {
    console.error('[reminders] Error sending Saturday late exit reminders:', error);
  }
}

/**
 * Check and send lunch return reminders.
 * Runs every 5 minutes between 14:00-16:00.
 * Sends reminder 10 minutes before the employee should return (2 hours after lunch_out).
 * Each employee receives only ONE lunch return reminder per day.
 */
export async function checkLunchReturnReminders(): Promise<void> {
  resetIfNewDay();
  const today = new Date().toISOString().split('T')[0];

  // Skip non-working days and Saturdays (no lunch break on Saturday)
  const workingDay = await queries.isWorkingDayAsync(today);
  if (!workingDay || isSaturday(today)) {
    return;
  }

  const now = new Date();
  // Convert UTC to São Paulo time (UTC-3) to match stored punch times
  const spHours = (now.getUTCHours() - 3 + 24) % 24;
  const currentMinutes = spHours * 60 + now.getUTCMinutes();

  try {
    const employees = await queries.getAllEmployees();
    const records = await queries.getDailyRecordsByDate(today);
    const onVacation = await getEmployeesOnVacation();
    const onIntegralFolga = await getEmployeesOnIntegralFolga();

    const recordMap = new Map(records.map(r => [r.employee_id, r]));

    let sent = 0;
    for (const emp of employees) {
      if (emp.no_punch_required || emp.is_apprentice || emp.is_intern) continue;
      if (hasReminderBeenSent(emp.id, 'lunch_return')) continue;
      if (onVacation.has(emp.id)) continue;
      if (onIntegralFolga.has(emp.id)) continue;
      // Loja Sustentável employees don't have a lunch break (punch_2 is their exit)
      if (isLojaSustentavelEmployee(emp.name)) continue;

      const record = recordMap.get(emp.id);
      // Has gone to lunch but hasn't returned yet
      if (record && record.punch_2 && !record.punch_3) {
        // Calculate when they should return (punch_2 + 2 hours)
        const [hours, mins] = record.punch_2.split(':').map(Number);
        const lunchOutMinutes = hours * 60 + mins;
        const shouldReturnMinutes = lunchOutMinutes + 120; // 2 hour lunch break

        // Send reminder 10 minutes before
        const reminderMinutes = shouldReturnMinutes - 10;

        // Check if we're at or past the reminder time (send once when we hit the window)
        if (currentMinutes >= reminderMinutes && currentMinutes <= shouldReturnMinutes) {
          const minutesLeft = shouldReturnMinutes - currentMinutes;
          await sendPunchReminder(emp.slack_id, emp.name, 'lunch_return', Math.max(minutesLeft, 1));
          markReminderSent(emp.id, 'lunch_return');
          sent++;
        }
      }
    }

    if (sent > 0) {
      console.log(`[reminders] Lunch return reminders sent to ${sent} employees`);
    }
  } catch (error) {
    console.error('[reminders] Error checking lunch return reminders:', error);
  }
}
