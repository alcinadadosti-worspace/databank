import { CronJob } from 'cron';
import { syncPunches } from './sync-punches';
import { sendDailyManagerAlerts } from './manager-daily-alert';

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
}

export function stopScheduler(): void {
  jobs.forEach(job => job.stop());
  console.log('[scheduler] All jobs stopped');
}
