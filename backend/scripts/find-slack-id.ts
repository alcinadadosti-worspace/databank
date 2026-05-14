import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();
const target = process.argv[2];
if (!target) { console.error('Usage: find-slack-id.ts <slack_id>'); process.exit(1); }

async function main() {
  const leaders = await db.collection('leaders').where('slack_id', '==', target).get();
  console.log(`leaders with slack_id=${target}:`, leaders.docs.map(d => d.data()));
  const emps = await db.collection('employees').where('slack_id', '==', target).get();
  console.log(`employees with slack_id=${target}:`, emps.docs.map(d => ({ id: d.data().id, name: d.data().name })));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
