/**
 * Migration script: Mark jovens aprendizes (apprentices).
 * They work 4h/day (240 min) and only punch entry + exit (2 punches).
 *
 * Run: npx tsx scripts/migrate-apprentices.ts
 */

import * as queries from '../src/models/queries';

const APPRENTICE_NAMES = [
  'Raquele Fragoso Da Silva',
  'Yuri Castro Gomes',
  'Lianda Melinda Santos Calixto',
];

const EXPECTED_DAILY_MINUTES = 240; // 4 hours

async function migrateApprentices(): Promise<void> {
  console.log('[migrate-apprentices] Starting...');
  const employees = await queries.getAllEmployees();
  let updated = 0;

  for (const name of APPRENTICE_NAMES) {
    const emp = employees.find(e => e.name.toLowerCase() === name.toLowerCase());
    if (emp) {
      await queries.setApprentice(emp.id, true, EXPECTED_DAILY_MINUTES);
      console.log(`[migrate-apprentices] Employee #${emp.id} "${emp.name}" -> is_apprentice=true, expected=240min`);
      updated++;
    } else {
      console.warn(`[migrate-apprentices] Employee not found: "${name}"`);
    }
  }

  if (updated > 0) {
    await queries.logAudit('MIGRATION', 'system', undefined,
      `Apprentice migration: ${updated} employees marked as jovem aprendiz (4h/day)`);
  }
  console.log(`[migrate-apprentices] Done! ${updated} employees updated.`);
}

migrateApprentices().catch(err => {
  console.error('[migrate-apprentices] Fatal error:', err);
  process.exit(1);
});
