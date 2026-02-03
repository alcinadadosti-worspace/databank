/**
 * Production seed: Only seeds if the database is empty.
 * Used by Render's startCommand to avoid re-seeding on every deploy.
 */

import { getDb, closeDb } from '../src/models/database';

function shouldSeed(): boolean {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as count FROM leaders').get() as any;
  return row.count === 0;
}

if (shouldSeed()) {
  console.log('[seed-prod] Database is empty, running seed...');
  // Import and run the seed script
  require('./seed');
} else {
  console.log('[seed-prod] Database already seeded, skipping.');
  closeDb();
}
