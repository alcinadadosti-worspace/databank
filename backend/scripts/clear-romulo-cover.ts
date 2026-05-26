import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

const ROMULO_ID = 1;

async function main() {
  const ref = db.collection('leaders').doc(String(ROMULO_ID));
  const snap = await ref.get();
  if (!snap.exists) {
    console.error(`Leader ${ROMULO_ID} not found`);
    process.exit(1);
  }
  const data = snap.data()!;
  console.log(`Before: ${data.name} (slack_id=${data.slack_id}, cover_leader_id=${data.cover_leader_id ?? 'none'})`);

  await ref.update({ cover_leader_id: FieldValue.delete() });

  const after = (await ref.get()).data()!;
  console.log(`After:  ${after.name} (slack_id=${after.slack_id}, cover_leader_id=${after.cover_leader_id ?? 'none'})`);
  console.log(`\nCobertura removida — Rômulo volta a receber os alertas do próprio time.`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
