/**
 * Migration script: Mark employees that don't use punch clock.
 * These employees are shown as "Sem ponto" in Funcionamento page.
 *
 * Run: npx tsx scripts/migrate-no-punch.ts
 */

import * as queries from '../src/models/queries';

const NO_PUNCH_NAMES = [
  'Luís Henrique Batista dos Santos',
  'Anderson Rosalvo Rocha dos Santos',
  'Caique dos santos da silva',
  'Millena Sthefany dos Santos Cruz',
];

async function migrateNoPunch(): Promise<void> {
  console.log('[migrate-no-punch] Starting...');
  const employees = await queries.getAllEmployees();
  let updated = 0;

  for (const name of NO_PUNCH_NAMES) {
    const matches = employees.filter(e => e.name.toLowerCase() === name.toLowerCase());
    if (matches.length === 0) {
      console.warn(`[migrate-no-punch] Employee not found: "${name}"`);
      continue;
    }
    for (const emp of matches) {
      await queries.setNoPunchRequired(emp.id, true);
      console.log(`[migrate-no-punch] Employee #${emp.id} "${emp.name}" -> no_punch_required=true`);
      updated++;
    }
  }

  if (updated > 0) {
    await queries.logAudit('MIGRATION', 'system', undefined,
      `No-punch migration: ${updated} employees marked as no punch required`);
  }
  console.log(`[migrate-no-punch] Done! ${updated} employees updated.`);
}

migrateNoPunch().catch(err => {
  console.error('[migrate-no-punch] Fatal error:', err);
  process.exit(1);
});
