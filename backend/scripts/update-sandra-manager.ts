import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

// Sandra da Conceição Freitas → Erick Café Santos Júnior (leader_id 7)
const ERICK_ID = 7;

async function main() {
  const snap = await db.collection('employees').get();
  const matches = snap.docs.filter(d => d.data().name?.toLowerCase().includes('sandra da conceição'));

  if (matches.length === 0) {
    console.log('Sandra da Conceição Freitas not found');
    process.exit(1);
  }
  if (matches.length > 1) {
    console.log('Multiple matches found:');
    matches.forEach(d => console.log(' -', d.id, d.data().name, 'leader_id:', d.data().leader_id));
    process.exit(1);
  }

  const sandra = matches[0];
  console.log('Found:', sandra.id, 'name:', sandra.data().name, 'current leader_id:', sandra.data().leader_id);

  await db.collection('employees').doc(sandra.id).update({ leader_id: ERICK_ID });
  console.log(`Updated leader_id to ${ERICK_ID} (Erick Café Santos Júnior)`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
