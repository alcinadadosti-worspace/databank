import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
async function main() {
  console.log('── Employees finais ──');
  for (const id of ['101', '102', '108', '109', '65']) {
    const d = (await db.collection('employees').doc(id).get()).data();
    console.log(`  [${id}] ${d ? `${d.name} | leader=${d.leader_id} | slack=${d.slack_id} | solides=${d.solides_employee_id}` : 'NÃO EXISTE'}`);
  }
  console.log('── Removidos (devem ser NÃO EXISTE) ──');
  for (const id of ['42', '61', '85', '98']) {
    const d = await db.collection('employees').doc(id).get();
    console.log(`  [${id}] ${d.exists ? 'AINDA EXISTE: ' + d.data()!.name : 'não existe ✓'}`);
  }
  console.log('── Líder 13 ──');
  console.log('  ' + JSON.stringify((await db.collection('leaders').doc('13').get()).data()));
  console.log('── Counter ──');
  console.log('  ' + JSON.stringify((await db.collection('counters').doc('employees').get()).data()));
  console.log('── Registros de hoje ──');
  for (const docId of ['101_2026-06-12', '108_2026-06-12', '109_2026-06-12']) {
    const d = (await db.collection('daily_records').doc(docId).get()).data();
    console.log(`  ${docId}: ${d ? `p1=${d.punch_1} p2=${d.punch_2} p3=${d.punch_3} p4=${d.punch_4} (updated ${d.updated_at || d.created_at})` : 'ainda não criado'}`);
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
