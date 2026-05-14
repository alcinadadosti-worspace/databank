import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

// Erick Café Santos Júnior -> leader_id 7
// Ana Clara de Matos Chagas -> leader_id 9
const ERICK_ID = 7;
const ANA_ID = 9;

async function main() {
  const ref = db.collection('leaders').doc(String(ERICK_ID));
  const snap = await ref.get();
  if (!snap.exists) {
    console.error(`Leader ${ERICK_ID} not found`);
    process.exit(1);
  }
  const data = snap.data()!;
  console.log(`Before: ${data.name} (slack_id=${data.slack_id}, cover_leader_id=${data.cover_leader_id ?? 'none'})`);

  await ref.update({ cover_leader_id: ANA_ID });

  const after = (await ref.get()).data()!;
  console.log(`After:  ${after.name} (slack_id=${after.slack_id}, cover_leader_id=${after.cover_leader_id})`);
  console.log(`\nAlertas do time de Erick agora vão para Ana Clara (leader_id=${ANA_ID}).`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
