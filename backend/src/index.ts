import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { getDb, closeDb } from './models/database';
import { startScheduler, stopScheduler } from './jobs/scheduler';
import { startSlackBot } from './slack/bot';

// Routes
import employeesRouter from './routes/employees';
import leadersRouter from './routes/leaders';
import recordsRouter from './routes/records';
import justificationsRouter from './routes/justifications';
import adminRouter from './routes/admin';
import authRouter from './routes/auth';

const app = express();

// Middleware
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json());

// API Routes
app.use('/api/auth', authRouter);
app.use('/api/employees', employeesRouter);
app.use('/api/leaders', leadersRouter);
app.use('/api/records', recordsRouter);
app.use('/api/justifications', justificationsRouter);
app.use('/api/admin', adminRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

async function start(): Promise<void> {
  // Initialize database
  getDb();
  console.log('[db] Database initialized');

  // Start Express server
  const port = parseInt(env.PORT, 10);
  app.listen(port, () => {
    console.log(`[server] Running on http://localhost:${port}`);
  });

  // Start cron jobs
  startScheduler();

  // Start Slack bot
  try {
    await startSlackBot();
  } catch (error) {
    console.error('[slack] Failed to start bot (will continue without Slack):', error);
  }
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[server] Shutting down...');
  stopScheduler();
  closeDb();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopScheduler();
  closeDb();
  process.exit(0);
});

start().catch((error) => {
  console.error('[server] Failed to start:', error);
  process.exit(1);
});
