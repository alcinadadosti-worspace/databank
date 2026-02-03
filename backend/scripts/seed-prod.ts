/**
 * Production seed: Only seeds if the Firestore database is empty.
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
    console.log('[seed-prod] Database already seeded, skipping.');
  }
}

main().catch(err => {
  console.error('[seed-prod] Error:', err);
  process.exit(1);
});
