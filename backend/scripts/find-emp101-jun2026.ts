import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
async function main() {
  for (const target of [101, 102]) {
    console.log(`═══ employee_id=${target} ═══`);
    const users = await db.collection('users').where('employee_id', '==', target).get();
    users.docs.forEach(d => console.log(`  user [${d.id}]: ${JSON.stringify(d.data())}`));
    for (const col of ['justifications', 'punch_adjustments', 'vacation_schedules', 'folgas', 'vacations']) {
      const snap = await db.collection(col).where('employee_id', '==', target).limit(2).get();
      snap.docs.forEach(d => console.log(`  ${col} [${d.id}]: ${JSON.stringify(d.data()).slice(0, 300)}`));
    }
    const recs = await db.collection('daily_records').where('employee_id', '==', target).limit(3).get();
    recs.docs.forEach(d => console.log(`  daily_record [${d.id}]: ${JSON.stringify(d.data()).slice(0, 250)}`));
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
