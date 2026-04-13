import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

async function main() {
  // Letícia Soares Belo - ID 71
  // Mon-Thu: 9h (540 min), Fri: 8h (480 = default, not overriding), Sat: não trabalha
  // JS day-of-week: 1=Mon, 2=Tue, 3=Wed, 4=Thu
  await db.collection('employees').doc('71').update({
    works_saturday: false,
    schedule_overrides: { '1': 540, '2': 540, '3': 540, '4': 540 },
  });

  const doc = await db.collection('employees').doc('71').get();
  console.log('Atualizado:', JSON.stringify(doc.data(), null, 2));
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
