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
  const roberia = snap.docs.find(d => d.data().name?.toLowerCase().includes('robéria') || d.data().name?.toLowerCase().includes('roberia'));

  if (!roberia) {
    console.log('Robéria not found');
    process.exit(1);
  }

  console.log('Found:', roberia.id, 'name:', roberia.data().name, 'current leader_id:', roberia.data().leader_id);

  // Alberto Luiz Marinho Batista = leader_id 2 (Logistica Palmeira dos Indios)
  await db.collection('employees').doc(roberia.id).update({ leader_id: 2 });
  console.log('Updated leader_id to 2 (Alberto Luiz Marinho Batista - Logistica)');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
