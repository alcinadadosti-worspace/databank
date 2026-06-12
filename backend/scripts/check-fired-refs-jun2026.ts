import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
async function main() {
  for (const empId of [42, 61, 98]) {
    for (const col of ['vacation_schedules', 'vacations', 'folgas', 'justifications', 'punch_adjustments']) {
      const snap = await db.collection(col).where('employee_id', '==', empId).get();
      if (snap.docs.length > 0) {
        console.log(`employee ${empId} → ${col}: ${snap.docs.length} docs (docIds: ${snap.docs.map(d => d.id).join(', ')})`);
      }
    }
  }
  console.log('verificação concluída');
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
