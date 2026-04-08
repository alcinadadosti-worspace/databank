import { CronJob } from 'cron';
import { syncPunches } from './sync-punches';
import { runDailyChecks, sendWeeklyManagerAlerts } from './manager-daily-alert';
import { sendEntryReminders, sendExitReminders, sendSaturdayExitReminders, sendSaturdayLateExitReminders, checkLunchReturnReminders } from './punch-reminders';
import { syncUpcomingHolidays } from '../services/holiday-sync';

const jobs: CronJob[] = [];

export function startScheduler(): void {
  // Sync punches every 5 minutes, Mon-Sat, 7:00–23:00
  const syncJob = CronJob.from({
    cronTime: '*/5 7-23 * * 1-6',
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
  console.log('[scheduler] Punch sync: every 5 min (Mon-Sat, 07:00-23:00)');

  // Catch-up sync at 07:50 Mon-Sat — syncs YESTERDAY to pick up punches made after
  // 23:00 or processed by Sólides with delay, before the 08:00 daily check runs
  const catchUpSyncJob = CronJob.from({
    cronTime: '50 7 * * 1-6',
    onTick: async () => {
      try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        console.log(`[scheduler] Running catch-up sync for ${yesterdayStr}...`);
        await syncPunches(yesterdayStr, { skipNotifications: true });
      } catch (error) {
        console.error('[scheduler] Catch-up sync error:', error);
      }
    },
    start: true,
    timeZone: 'America/Sao_Paulo',
  });
  jobs.push(catchUpSyncJob);
  console.log('[scheduler] Catch-up sync (yesterday): 07:50 (Mon-Sat)');

  // Daily checks at 08:00, Mon-Sat (employee notifications only)
  const dailyCheckJob = CronJob.from({
    cronTime: '0 8 * * 1-6',
    onTick: async () => {
      try {
        await runDailyChecks();
      } catch (error) {
        console.error('[scheduler] Daily check error:', error);
      }
    },
    start: true,
    timeZone: 'America/Sao_Paulo',
  });
  jobs.push(dailyCheckJob);
  console.log('[scheduler] Daily employee check: 08:00 (Mon-Sat)');

  // Weekly manager summary at 08:00 on Friday
  const weeklyManagerJob = CronJob.from({
    cronTime: '0 8 * * 5',
    onTick: async () => {
      try {
        await sendWeeklyManagerAlerts();
      } catch (error) {
        console.error('[scheduler] Weekly manager alert error:', error);
      }
    },
    start: true,
    timeZone: 'America/Sao_Paulo',
  });
  jobs.push(weeklyManagerJob);
  console.log('[scheduler] Weekly manager summary: 08:00 (Friday)');

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
  console.log('[scheduler] Saturday exit reminder: 11:50 (Sat) — standard units');

  // Saturday exit reminder at 13:50 for units that work until 14:00
  const saturdayLateExitReminderJob = CronJob.from({
    cronTime: '50 13 * * 6',
    onTick: async () => {
      try {
        await sendSaturdayLateExitReminders();
      } catch (error) {
        console.error('[scheduler] Saturday late exit reminder error:', error);
      }
    },
    start: true,
    timeZone: 'America/Sao_Paulo',
  });
  jobs.push(saturdayLateExitReminderJob);
  console.log('[scheduler] Saturday late exit reminder: 13:50 (Sat) — Loja Palmeira dos Indios, Loja Penedo');

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

  // ─── Holiday Sync ─────────────────────────────────────────────

  // Sync holidays on January 1st at 03:00 (to get next year's holidays)
  const holidaySyncJob = CronJob.from({
    cronTime: '0 3 1 1 *',
    onTick: async () => {
      try {
        console.log('[scheduler] Running yearly holiday sync...');
        const results = await syncUpcomingHolidays();
        const totalCreated = results.reduce((sum, r) => sum + r.created, 0);
        console.log(`[scheduler] Holiday sync completed: ${totalCreated} holidays synced`);
      } catch (error) {
        console.error('[scheduler] Holiday sync error:', error);
      }
    },
    start: true,
    timeZone: 'America/Sao_Paulo',
  });
  jobs.push(holidaySyncJob);
  console.log('[scheduler] Holiday sync: 03:00 on January 1st');
}

export function stopScheduler(): void {
  jobs.forEach(job => job.stop());
  console.log('[scheduler] All jobs stopped');
}
