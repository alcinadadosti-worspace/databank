import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { getDb } from './models/database';
import { startScheduler, stopScheduler } from './jobs/scheduler';
import { syncPunches } from './jobs/sync-punches';
import { startSlackBot } from './slack/bot';

// Routes
import employeesRouter from './routes/employees';
import leadersRouter from './routes/leaders';
import recordsRouter from './routes/records';
import justificationsRouter from './routes/justifications';
import adminRouter from './routes/admin';
import authRouter from './routes/auth';
import holidaysRouter from './routes/holidays';

const app = express();

// Middleware
app.use(cors({
  origin: env.FRONTEND_URL ? env.FRONTEND_URL.split(',') : '*',
  credentials: true,
}));
app.use(express.json());

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/leaders', leadersRouter);
app.use('/api/records', recordsRouter);
app.use('/api/justifications', justificationsRouter);
app.use('/api/admin', adminRouter);
app.use('/api/holidays', holidaysRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

async function start(): Promise<void> {
  // Initialize Firestore connection
  getDb();
  console.log('[db] Firestore initialized');

  // Start Express server
  const port = parseInt(env.PORT, 10);
  app.listen(port, () => {
    console.log(`[server] Running on http://localhost:${port}`);
  });

  // Start cron jobs
  startScheduler();

  // Run immediate sync on startup (server may have been sleeping)
  syncPunches().catch(err => console.error('[startup] Initial sync failed:', err));

  // Start Slack bot (only if tokens are configured)
  if (env.SLACK_BOT_TOKEN && env.SLACK_BOT_TOKEN.startsWith('xoxb-')) {
    try {
      await startSlackBot();
    } catch (error) {
      console.error('[slack] Failed to start bot (will continue without Slack):', error);
    }
  } else {
    console.log('[slack] Bot disabled — no valid tokens configured');
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[server] Shutting down...');
  stopScheduler();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopScheduler();
  process.exit(0);
});

start().catch((error) => {
  console.error('[server] Failed to start:', error);
  process.exit(1);
});
