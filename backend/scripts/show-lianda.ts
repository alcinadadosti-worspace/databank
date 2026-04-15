import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

async function main() {
  const snap = await db.collection('employees').get();
  const emp = snap.docs.find(d => d.data().name?.toLowerCase().includes('lianda'));
  if (emp) console.log(JSON.stringify(emp.data(), null, 2));
  else console.log('Não encontrado');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
