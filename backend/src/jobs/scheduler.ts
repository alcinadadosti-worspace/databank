import { CronJob } from 'cron';
import { syncPunches } from './sync-punches';
import { sendDailyManagerAlerts } from './manager-daily-alert';
import { sendEntryReminders, sendExitReminders, sendSaturdayExitReminders, checkLunchReturnReminders } from './punch-reminders';

const jobs: CronJob[] = [];

export function startScheduler(): void {
  // Sync punches every 5 minutes, Mon-Sat, 7:00–20:00
  const syncJob = CronJob.from({
    cronTime: '*/5 7-20 * * 1-6',
    onTick: async () => {
      try {
        await syncPunches();
      } catch (error) {
        console.error('[scheduler] Sync error:', error);
      }
    },
    start: true,
    timeZone: 'America/Sao_Paulo',
  });
  jobs.push(syncJob);
  console.log('[scheduler] Punch sync: every 5 min (Mon-Sat, 07:00-20:00)');

  // Daily manager alert at 08:00, Mon-Sat
  const dailyAlertJob = CronJob.from({
    cronTime: '0 8 * * 1-6',
    onTick: async () => {
      try {
        await sendDailyManagerAlerts();
      } catch (error) {
        console.error('[scheduler] Daily alert error:', error);
      }
    },
    start: true,
    timeZone: 'America/Sao_Paulo',
  });
  jobs.push(dailyAlertJob);
  console.log('[scheduler] Manager daily alert: 08:00 (Mon-Sat)');

  // ─── Punch Reminders ─────────────────────────────────────────────

  // Entry reminder at 7:50 AM, Mon-Sat
  const entryReminderJob = CronJob.from({
    cronTime: '50 7 * * 1-6',
    onTick: async () => {
      try {
        await sendEntryReminders();
      } catch (error) {
        console.error('[scheduler] Entry reminder error:', error);
      }
    },
    start: true,
    timeZone: 'America/Sao_Paulo',
  });
  jobs.push(entryReminderJob);
  console.log('[scheduler] Entry reminder: 07:50 (Mon-Sat)');

  // Exit reminder at 17:50 PM, Mon-Fri (not Saturday)
  const exitReminderJob = CronJob.from({
    cronTime: '50 17 * * 1-5',
    onTick: async () => {
      try {
        await sendExitReminders();
      } catch (error) {
        console.error('[scheduler] Exit reminder error:', error);
      }
    },
    start: true,
    timeZone: 'America/Sao_Paulo',
  });
  jobs.push(exitReminderJob);
  console.log('[scheduler] Exit reminder: 17:50 (Mon-Fri)');

  // Saturday exit reminder at 11:50 AM
  const saturdayExitReminderJob = CronJob.from({
    cronTime: '50 11 * * 6',
    onTick: async () => {
      try {
        await sendSaturdayExitReminders();
      } catch (error) {
        console.error('[scheduler] Saturday exit reminder error:', error);
      }
    },
    start: true,
    timeZone: 'America/Sao_Paulo',
  });
  jobs.push(saturdayExitReminderJob);
  console.log('[scheduler] Saturday exit reminder: 11:50 (Sat)');

  // Lunch return reminder check every 5 minutes, 14:00-16:00, Mon-Fri
  const lunchReturnReminderJob = CronJob.from({
    cronTime: '*/5 14-16 * * 1-5',
    onTick: async () => {
      try {
        await checkLunchReturnReminders();
      } catch (error) {
        console.error('[scheduler] Lunch return reminder error:', error);
      }
    },
    start: true,
    timeZone: 'America/Sao_Paulo',
  });
  jobs.push(lunchReturnReminderJob);
  console.log('[scheduler] Lunch return reminder: every 5 min (Mon-Fri, 14:00-16:00)');
}

export function stopScheduler(): void {
  jobs.forEach(job => job.stop());
  console.log('[scheduler] All jobs stopped');
}
