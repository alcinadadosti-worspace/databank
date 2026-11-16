/**
 * 2026-11-16 — Sandra da Conceição Freitas (employee 32) sai do Erick Café (leader 7)
 * para o João Antonio Tavares Santos (leader 3).
 *
 * Só troca `leader_id`. Um `unit_name` antigo do Erick deixa de valer sozinho
 * (explicitUnitNameFor), então ela passa a aparecer no card do leader 3.
 *
 *   npx tsx scripts/move-sandra-to-joao-antonio-nov2026.ts           # dry-run
 *   npx tsx scripts/move-sandra-to-joao-antonio-nov2026.ts --commit  # grava
 */
import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();
const COMMIT = process.argv.includes('--commit');

const EMPLOYEE_ID = 32;
const EXPECTED_OLD_LEADER = 7; // Erick Café Santos Júnior
const NEW_LEADER_ID = 3;       // João Antonio Tavares Santos

async function main() {
  // Homônimos: garantir que só existe uma Sandra Freitas
  const all = await db.collection('employees').get();
  const sandras = all.docs.filter(d => (d.data().name ?? '').toLowerCase().includes('sandra'));
  console.log('Colaboradores com "sandra" no nome:');
  sandras.forEach(d => {
    const e = d.data();
    console.log(`  ${d.id} ${e.name} | leader_id=${e.leader_id} | unit_name=${e.unit_name ?? null} | no_punch=${e.no_punch_required ?? false}`);
  });

  const empRef = db.collection('employees').doc(String(EMPLOYEE_ID));
  const empDoc = await empRef.get();
  if (!empDoc.exists) throw new Error(`employee ${EMPLOYEE_ID} não existe`);
  const emp = empDoc.data()!;
  if (!(emp.name ?? '').toLowerCase().includes('sandra')) {
    throw new Error(`employee ${EMPLOYEE_ID} é "${emp.name}", não Sandra — abortando`);
  }

  const leaderDoc = await db.collection('leaders').doc(String(NEW_LEADER_ID)).get();
  if (!leaderDoc.exists) throw new Error(`leader ${NEW_LEADER_ID} não existe`);
  const leader = leaderDoc.data()!;
  if (!(leader.name ?? '').toLowerCase().includes('jo')) {
    throw new Error(`leader ${NEW_LEADER_ID} é "${leader.name}", não João Antonio — abortando`);
  }

  console.log('\nSandra (antes):');
  console.log(`  name=${emp.name}`);
  console.log(`  leader_id=${emp.leader_id}  (esperado ${EXPECTED_OLD_LEADER})`);
  console.log(`  unit_name=${emp.unit_name ?? null}`);
  console.log(`  secondary_approver_id=${emp.secondary_approver_id ?? null}`);
  console.log(`  alert_cover_leader_id=${emp.alert_cover_leader_id ?? null}`);
  console.log(`  no_punch_required=${emp.no_punch_required ?? false}  slack_id=${emp.slack_id ?? null}`);
  console.log(`\nNovo gestor: ${NEW_LEADER_ID} ${leader.name} | slack=${leader.slack_id ?? null} | cover_leader_id=${leader.cover_leader_id ?? null}`);

  if (emp.leader_id === NEW_LEADER_ID) {
    console.log('\nJá está no leader 3 — nada a fazer.');
    return;
  }
  if (emp.leader_id !== EXPECTED_OLD_LEADER) {
    console.log(`\nATENÇÃO: leader_id atual é ${emp.leader_id}, não ${EXPECTED_OLD_LEADER}.`);
  }

  console.log(`\nMudança: leader_id ${emp.leader_id} -> ${NEW_LEADER_ID}`);
  if (!COMMIT) {
    console.log('(dry-run — rode com --commit para gravar)');
    return;
  }

  await empRef.update({ leader_id: NEW_LEADER_ID });
  const after = (await empRef.get()).data()!;
  console.log(`Gravado. leader_id agora = ${after.leader_id}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
