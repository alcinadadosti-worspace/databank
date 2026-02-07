import * as queries from '../models/queries';
import { sendPunchReminder } from '../slack/bot';
import { isWorkingDay, isSaturday } from '../config/constants';

/**
 * Send entry reminder at 7:50 AM.
 * Reminds employees who haven't punched in yet.
 */
export async function sendEntryReminders(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  // Skip non-working days
  if (!isWorkingDay(today)) {
    console.log('[reminders] Skipping entry reminder - not a working day');
    return;
  }

  console.log('[reminders] Sending entry reminders (10 min before 8:00)');

  try {
    const employees = await queries.getAllEmployees();
    const records = await queries.getDailyRecordsByDate(today);
    const punchedIds = new Set(records.map(r => r.employee_id));

    // Send to employees who haven't punched yet and have a Slack ID
    let sent = 0;
    for (const emp of employees) {
      // Skip if already punched or no punch required
      if (punchedIds.has(emp.id) || emp.no_punch_required) continue;

      await sendPunchReminder(emp.slack_id, emp.name, 'entry', 10);
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
 */
export async function sendExitReminders(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  // Skip non-working days
  if (!isWorkingDay(today)) {
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

    // Create map of employee records
    const recordMap = new Map(records.map(r => [r.employee_id, r]));

    // Send to employees who have punch_3 but not punch_4 (didn't punch out yet)
    let sent = 0;
    for (const emp of employees) {
      if (emp.no_punch_required || emp.is_apprentice) continue;

      const record = recordMap.get(emp.id);
      // Has returned from lunch but hasn't left yet
      if (record && record.punch_3 && !record.punch_4) {
        await sendPunchReminder(emp.slack_id, emp.name, 'exit', 10);
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
 */
export async function sendSaturdayExitReminders(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  // Only run on Saturday
  if (!isSaturday(today)) {
    return;
  }

  console.log('[reminders] Sending Saturday exit reminders (10 min before 12:00)');

  try {
    const employees = await queries.getAllEmployees();
    const records = await queries.getDailyRecordsByDate(today);

    const recordMap = new Map(records.map(r => [r.employee_id, r]));

    // Send to employees who have punch_1 but not punch_2 (didn't leave yet)
    let sent = 0;
    for (const emp of employees) {
      if (emp.no_punch_required) continue;

      const record = recordMap.get(emp.id);
      if (record && record.punch_1 && !record.punch_2) {
        await sendPunchReminder(emp.slack_id, emp.name, 'exit', 10);
        sent++;
      }
    }

    console.log(`[reminders] Saturday exit reminders sent to ${sent} employees`);
  } catch (error) {
    console.error('[reminders] Error sending Saturday exit reminders:', error);
  }
}

/**
 * Check and send lunch return reminders.
 * Runs every 5 minutes between 13:00-15:00.
 * Sends reminder 10 minutes before the employee should return (1 hour after lunch_out).
 */
export async function checkLunchReturnReminders(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  // Skip non-working days and Saturdays (no lunch break on Saturday)
  if (!isWorkingDay(today) || isSaturday(today)) {
    return;
  }

  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  try {
    const employees = await queries.getAllEmployees();
    const records = await queries.getDailyRecordsByDate(today);

    const recordMap = new Map(records.map(r => [r.employee_id, r]));

    let sent = 0;
    for (const emp of employees) {
      if (emp.no_punch_required || emp.is_apprentice) continue;

      const record = recordMap.get(emp.id);
      // Has gone to lunch but hasn't returned yet
      if (record && record.punch_2 && !record.punch_3) {
        // Calculate when they should return (punch_2 + 2 hours)
        const [hours, mins] = record.punch_2.split(':').map(Number);
        const lunchOutMinutes = hours * 60 + mins;
        const shouldReturnMinutes = lunchOutMinutes + 120; // 2 hour lunch break

        // Send reminder 10 minutes before
        const reminderMinutes = shouldReturnMinutes - 10;

        // Check if we're within the reminder window (±2 minutes to avoid duplicates)
        if (currentMinutes >= reminderMinutes && currentMinutes <= reminderMinutes + 2) {
          const minutesLeft = shouldReturnMinutes - currentMinutes;
          await sendPunchReminder(emp.slack_id, emp.name, 'lunch_return', Math.max(minutesLeft, 1));
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
