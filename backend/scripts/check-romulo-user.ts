import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

async function main() {
  const byOld = await db.collection('users').where('slack_id', '==', 'U07LSKN7SNL').get();
  const byNew = await db.collection('users').where('slack_id', '==', 'U07LGG4RPK3').get();
  const byLeaderId = await db.collection('users').where('leader_id', '==', 1).get();
  console.log('users with old slack_id U07LSKN7SNL:', byOld.docs.map(d => d.data()));
  console.log('users with new slack_id U07LGG4RPK3:', byNew.docs.map(d => d.data()));
  console.log('users with leader_id=1 (Romulo):', byLeaderId.docs.map(d => d.data()));
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
