import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

/**
 * Demitidos em 2026-10-26 (nomes passados pelo usuario).
 * Mesmo fluxo de apply-demitidos-oct2026.ts: remove o employee e o vencimento de
 * ferias (vacation_schedules). Historico (daily_records, justifications,
 * punch_adjustments, folgas, vacations, medical_leaves) e mantido.
 * Rode sem argumentos para dry-run e com --commit para aplicar.
 */
const TO_DELETE: { id: number; name: string }[] = [
  { id: 103, name: 'Maria Fernanda Gomes Vieira' },
  { id: 125, name: 'João Paulo Vieira Melo' },
];

/** Partes do nome para listar homonimos que NAO devem ser removidos */
const HOMONYM_KEYS = ['maria fernanda', 'joao paulo', 'fernanda gomes', 'vieira melo'];

const COMMIT = process.argv.includes('--commit');

function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

async function main() {
  console.log(COMMIT ? '=== COMMIT ===' : '=== DRY RUN (use --commit para aplicar) ===');

  const [employees, leaders] = await Promise.all([
    db.collection('employees').get(),
    db.collection('leaders').get(),
  ]);
  console.log('\nNomes parecidos (employees):');
  for (const d of employees.docs) {
    const name = String(d.data().name ?? '');
    if (HOMONYM_KEYS.some(k => normalize(name).includes(k))) {
      console.log(`  employee ${d.id} | ${name} | leader ${d.data().leader_id}`);
    }
  }
  console.log('Nomes parecidos (leaders):');
  for (const d of leaders.docs) {
    const name = String(d.data().name ?? '');
    if (HOMONYM_KEYS.some(k => normalize(name).includes(k))) {
      console.log(`  leader ${d.id} | ${name}`);
    }
  }

  for (const target of TO_DELETE) {
    const ref = db.collection('employees').doc(String(target.id));
    const doc = await ref.get();
    if (!doc.exists) { console.log(`\n❌ id ${target.id} nao existe (${target.name})`); continue; }
    const data = doc.data()!;
    if (data.name !== target.name) {
      console.log(`\n❌ id ${target.id}: nome no Firestore "${data.name}" != "${target.name}", pulando`);
      continue;
    }

    const [vs, folgas, vacations, leaves, lastRecords] = await Promise.all([
      db.collection('vacation_schedules').where('employee_id', '==', target.id).get(),
      db.collection('folgas').where('employee_id', '==', target.id).get(),
      db.collection('vacations').where('employee_id', '==', target.id).get(),
      db.collection('medical_leaves').where('employee_id', '==', target.id).get(),
      db.collection('daily_records').where('employee_id', '==', target.id).get(),
    ]);
    const lastDate = lastRecords.docs.map(r => String(r.data().date)).sort().pop() ?? '-';
    console.log(`\nid ${target.id} | ${data.name} | leader ${data.leader_id} | secondary ${data.secondary_approver_id ?? '-'} | slack ${data.slack_id ?? '-'} | solides ${data.solides_employee_id ?? '-'}`);
    console.log(`  vacation_schedules: ${vs.size} | folgas: ${folgas.size} | vacations: ${vacations.size} | medical_leaves: ${leaves.size} | daily_records: ${lastRecords.size} (ultimo ${lastDate})`);
    vs.docs.forEach(v => console.log(`    vacation_schedule ${v.id}: ${JSON.stringify(v.data())}`));

    if (!COMMIT) continue;
    for (const v of vs.docs) {
      await v.ref.delete();
      console.log(`  🗑 vacation_schedule ${v.id} removido`);
    }
    await ref.delete();
    console.log(`  ✓ employee ${target.id} removido`);
  }

  console.log('\nConcluido.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
