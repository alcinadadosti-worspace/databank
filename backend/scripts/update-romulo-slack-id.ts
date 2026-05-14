import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

// Romulo Jose Santos Lisboa -> leader_id 1
const ROMULO_ID = 1;
const NEW_SLACK_ID = 'U07LGG4RPK3';

async function main() {
  const ref = db.collection('leaders').doc(String(ROMULO_ID));
  const snap = await ref.get();
  if (!snap.exists) {
    console.error(`Leader ${ROMULO_ID} not found`);
    process.exit(1);
  }
  const data = snap.data()!;
  console.log(`Before: ${data.name} (slack_id=${data.slack_id})`);

  await ref.update({ slack_id: NEW_SLACK_ID });

  const after = (await ref.get()).data()!;
  console.log(`After:  ${after.name} (slack_id=${after.slack_id})`);
  console.log(`\nAlertas do time de ${after.name} agora chegam em ${NEW_SLACK_ID}.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
