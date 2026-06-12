import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
async function main() {
  console.log('Counter employees:', (await db.collection('counters').doc('employees').get()).data());
  const snap = await db.collection('employees').get();
  const all = snap.docs.map(d => ({ docId: d.id, ...d.data() } as any));
  all.sort((a, b) => Number(a.id) - Number(b.id));
  console.log(`Total employees: ${all.length}`);
  for (const e of all.filter(e => Number(e.id) >= 95)) {
    console.log(`  [doc ${e.docId}] id=${e.id} ${e.name} | leader=${e.leader_id} | solides=${e.solides_employee_id} | created=${e.created_at}`);
  }
  // daily_records órfãos de employee_ids 99-107 indicariam funcionários sobrescritos
  for (const id of [99,100,101,102,103,104,105,106]) {
    const recs = await db.collection('daily_records').where('employee_id', '==', id).limit(3).get();
    if (recs.docs.length) {
      const exists = all.find(e => Number(e.id) === id);
      console.log(`  daily_records de employee_id=${id}: ${recs.docs.length}+ registros | employee atual: ${exists ? exists.name : 'NÃO EXISTE'}`);
    }
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
