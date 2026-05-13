import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

async function main() {
  const target = 'mariane santos sousa';
  const snap = await db.collection('employees').get();
  const matches = snap.docs.filter(d => (d.data().name ?? '').toLowerCase() === target);

  if (matches.length === 0) {
    console.log(`Não encontrado: ${target}`);
    process.exit(1);
  }

  for (const doc of matches) {
    const data = doc.data();
    await doc.ref.update({ no_punch_required: true });
    console.log(`✓ no_punch_required = true: ${data.name} (ID ${data.id}, leader_id ${data.leader_id})`);
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
