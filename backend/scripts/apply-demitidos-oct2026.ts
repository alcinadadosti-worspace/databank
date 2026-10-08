import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

/**
 * Demitidos em out/2026 (nomes confirmados com o usuario em 2026-10-08).
 * Remove o employee e o vencimento de ferias (vacation_schedules), mesmo padrao
 * de update-employees-status.ts. Historico (daily_records, justifications,
 * punch_adjustments, folgas, vacations) e mantido.
 * Rode sem argumentos para dry-run e com --commit para aplicar.
 */
const TO_DELETE: { id: number; name: string }[] = [
  { id: 121, name: 'Juliene Reis Ferreira' },
  { id: 116, name: 'Amanda de Araújo Santos' },
  { id: 43, name: 'Camilla Emanuelle Lopes de Almeida' },
  { id: 104, name: 'Joanna Queiroz' },
];

const COMMIT = process.argv.includes('--commit');

async function main() {
  console.log(COMMIT ? '=== COMMIT ===' : '=== DRY RUN (use --commit para aplicar) ===');

  for (const target of TO_DELETE) {
    const ref = db.collection('employees').doc(String(target.id));
    const doc = await ref.get();
    if (!doc.exists) { console.log(`\n❌ id ${target.id} nao existe (${target.name})`); continue; }
    const data = doc.data()!;
    if (data.name !== target.name) {
      console.log(`\n❌ id ${target.id}: nome no Firestore "${data.name}" != "${target.name}", pulando`);
      continue;
    }

    const [vs, folgas, vacations] = await Promise.all([
      db.collection('vacation_schedules').where('employee_id', '==', target.id).get(),
      db.collection('folgas').where('employee_id', '==', target.id).get(),
      db.collection('vacations').where('employee_id', '==', target.id).get(),
    ]);
    console.log(`\nid ${target.id} | ${data.name} | leader ${data.leader_id}`);
    console.log(`  vacation_schedules: ${vs.size} | folgas: ${folgas.size} | vacations: ${vacations.size}`);
    folgas.docs.forEach(f => console.log(`    folga ${f.id}: ${JSON.stringify(f.data())}`));
    vacations.docs.forEach(v => console.log(`    vacation ${v.id}: ${JSON.stringify(v.data())}`));

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
