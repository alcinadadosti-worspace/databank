import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

async function main() {
  const empSnap = await db.collection('employees').get();

  const anny = empSnap.docs.find(d => d.data().name?.toLowerCase().includes('anny karoline'));
  console.log('=== Anny Karoline ===');
  console.log(JSON.stringify(anny?.data()));

  const marianeEmp = empSnap.docs.find(d => {
    const n = d.data().name?.toLowerCase() ?? '';
    return n.includes('mariane') && n.includes('sousa');
  });
  console.log('\n=== Mariane como employee ===');
  console.log(marianeEmp ? JSON.stringify(marianeEmp.data()) : 'NAO existe como employee');

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
