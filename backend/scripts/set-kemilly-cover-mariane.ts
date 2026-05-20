import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

// Kemilly Rafaelly Souza Silva -> leader_id 10
// Mariane Santos Sousa -> leader_id 12
const KEMILLY_ID = 10;
const MARIANE_ID = 12;

async function main() {
  const ref = db.collection('leaders').doc(String(KEMILLY_ID));
  const snap = await ref.get();
  if (!snap.exists) {
    console.error(`Leader ${KEMILLY_ID} not found`);
    process.exit(1);
  }
  const data = snap.data()!;
  console.log(`Before: ${data.name} (slack_id=${data.slack_id}, cover_leader_id=${data.cover_leader_id ?? 'none'})`);

  await ref.update({ cover_leader_id: MARIANE_ID });

  const after = (await ref.get()).data()!;
  console.log(`After:  ${after.name} (slack_id=${after.slack_id}, cover_leader_id=${after.cover_leader_id})`);
  console.log(`\nAlertas do time de Kemilly agora vão para Mariane Santos Sousa (leader_id=${MARIANE_ID}).`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
