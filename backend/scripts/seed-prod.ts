/**
 * Production seed: Only seeds if the Firestore database is empty.
 * If already seeded, runs the name migration to ensure data is up-to-date.
 * Used by Render's startCommand to avoid re-seeding on every deploy.
 */

import { getDb, COLLECTIONS } from '../src/models/database';

async function main() {
  const db = getDb();
  const snap = await db.collection(COLLECTIONS.LEADERS).limit(1).get();

  if (snap.empty) {
    console.log('[seed-prod] Database is empty, running seed...');
    await import('./seed');
  } else {
    console.log('[seed-prod] Database already seeded, running migrations...');
    await import('./migrate-names');
  }

  console.log('[seed-prod] Running sector migration...');
  await import('./migrate-sectors');

  console.log('[seed-prod] Running apprentice migration...');
  await import('./migrate-apprentices');

  console.log('[seed-prod] Running no-punch migration...');
  await import('./migrate-no-punch');
}

main().catch(err => {
  console.error('[seed-prod] Error:', err);
  process.exit(1);
});
