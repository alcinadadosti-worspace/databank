import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

async function main() {
  const snap = await db.collection('employees').where('slack_id', '==', 'U09ED6DM61G').limit(1).get();
  if (snap.empty) { console.log('Não encontrada'); process.exit(1); }
  const data = snap.docs[0].data();
  console.log(`Encontrada: ${data.name} (ID ${data.id})`);
  await snap.docs[0].ref.delete();
  console.log(`✓ Deletada com sucesso`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
