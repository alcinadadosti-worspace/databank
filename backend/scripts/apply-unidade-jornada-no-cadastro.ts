import 'dotenv/config';
import { getDb, COLLECTIONS } from '../src/models/database';
import * as queries from '../src/models/queries';
import { EXTENDED_SATURDAY_EMPLOYEES, LOJA_SUSTENTAVEL_EMPLOYEES, NO_LUNCH_EMPLOYEES, todayInSaoPaulo } from '../src/config/constants';

/**
 * Nov/2026 — copies what the name lists in the code decide into each person's
 * registration, so the RH panel can register/remove people without code changes:
 *   unit_name         ← card from the legacy lists (gestores 2, 10, 11, 18 and the gestoras/VD leaders under 1 and 6)
 *   saturday_minutes  ← 360 for EXTENDED_SATURDAY_EMPLOYEES
 *   schedule_type     ← 'loja_sustentavel' / 'sem_almoco' for those lists
 * Only fills fields that are still empty; touches nothing else. The lists stay in the
 * code as fallback, so the behavior is the same before and after.
 * Safety check: for everyone who punches, the card computed here must be the card the
 * Unidades view shows today — any mismatch aborts the commit.
 *
 *   npx tsx scripts/apply-unidade-jornada-no-cadastro.ts            (dry-run)
 *   npx tsx scripts/apply-unidade-jornada-no-cadastro.ts --commit   (grava)
 */
const COMMIT = process.argv.includes('--commit');
const LEADERS_WITH_UNIT_FIELD = new Set([...Object.keys(queries.UNIT_OPTIONS_BY_LEADER).map(Number), 1, 6]);

async function main() {
  console.log(COMMIT ? '=== COMMIT ===' : '=== DRY RUN (use --commit para gravar) ===');
  const employees = await queries.getAllEmployees();

  // Where each punching employee shows today (current code/data)
  const today = todayInSaoPaulo();
  const cardOf = new Map<number, string>();
  for (const unit of await queries.getUnitRecords(today)) {
    for (const e of unit.employees) cardOf.set(e.id, unit.unit_name);
  }

  const plans: { id: number; name: string; update: Record<string, unknown> }[] = [];
  const mismatches: string[] = [];
  const noCard: string[] = [];

  for (const emp of employees) {
    const update: Record<string, unknown> = {};
    const lower = emp.name.toLowerCase();

    if (!emp.unit_name && LEADERS_WITH_UNIT_FIELD.has(emp.leader_id)) {
      const legacy = queries.legacyUnitNameFor(emp);
      if (legacy) update.unit_name = legacy;
      else if (!emp.no_punch_required) noCard.push(`${emp.id} ${emp.name} (gestor ${emp.leader_id})`);
      if (legacy && !emp.no_punch_required && cardOf.get(emp.id) !== legacy) {
        mismatches.push(`${emp.id} ${emp.name}: lista diz "${legacy}", Unidades mostra "${cardOf.get(emp.id) ?? 'nenhum card'}"`);
      }
    }
    if ((emp.saturday_minutes === undefined || emp.saturday_minutes === null) && EXTENDED_SATURDAY_EMPLOYEES.has(lower)) {
      update.saturday_minutes = 360;
    }
    if (!emp.schedule_type) {
      if (LOJA_SUSTENTAVEL_EMPLOYEES.has(lower)) update.schedule_type = 'loja_sustentavel';
      else if (NO_LUNCH_EMPLOYEES.has(lower)) update.schedule_type = 'sem_almoco';
    }
    if (Object.keys(update).length > 0) plans.push({ id: emp.id, name: emp.name, update });
  }

  console.log(`\n${plans.length} cadastro(s) a completar:`);
  for (const p of plans.sort((a, b) => a.id - b.id)) console.log(`  ${p.id} ${p.name} → ${JSON.stringify(p.update)}`);
  if (noCard.length) {
    console.log(`\nBatem ponto mas já hoje não aparecem em nenhum card (nada muda para eles):`);
    noCard.forEach(l => console.log(`  ${l}`));
  }
  if (mismatches.length) {
    console.log(`\n❌ ${mismatches.length} divergência(s) entre a lista e a aba Unidades — nada será gravado:`);
    mismatches.forEach(l => console.log(`  ${l}`));
    process.exit(1);
  }
  console.log('\nConferência com a aba Unidades: tudo igual ✓');

  if (!COMMIT) { console.log('\nDRY-RUN: nada gravado.'); process.exit(0); }

  const db = getDb();
  for (const p of plans) {
    await db.collection(COLLECTIONS.EMPLOYEES).doc(String(p.id)).update(p.update);
  }
  await queries.logAudit('MIGRATION', 'system', undefined,
    `Listas de nomes → cadastro (unit_name/saturday_minutes/schedule_type): ${plans.length} colaboradores`);
  console.log(`\n✓ ${plans.length} cadastro(s) atualizados.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
