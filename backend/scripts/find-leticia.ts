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
  console.log('Total:', snap.size);
  snap.docs.forEach(d => {
    const name: string = d.data().name || '';
    const lower = name.toLowerCase();
    if (lower.includes('soares') || lower.includes('belo') || lower.includes('leticia') || lower.includes('letícia')) {
      console.log(d.id, name, JSON.stringify(d.data()));
    }
  });
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
