import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

async function main() {
  const snap = await db.collection('employees').where('id', '==', 37).limit(1).get();
  if (snap.empty) { console.log('Não encontrado'); process.exit(1); }
  const data = snap.docs[0].data();
  await snap.docs[0].ref.delete();
  console.log(`✓ Deletado: ${data.name} (ID ${data.id})`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
