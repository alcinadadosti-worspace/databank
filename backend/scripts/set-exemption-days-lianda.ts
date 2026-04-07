import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

async function main() {
  // Find Lianda by name
  const snap = await db.collection('employees').get();
  const lianda = snap.docs.find(d => {
    const name: string = d.data().name ?? '';
    return name.toLowerCase().includes('lianda');
  });

  if (!lianda) {
    console.error('Employee "Lianda" not found!');
    process.exit(1);
  }

  console.log('Found employee:', JSON.stringify(lianda.data(), null, 2));

  // Set exemption_days: [2] = Tuesday (0=Sun, 1=Mon, 2=Tue, ...)
  await db.collection('employees').doc(lianda.id).update({
    exemption_days: [2],
    exemption_reason: 'Estagiária - Curso às terças-feiras',
  });

  console.log(`✓ Updated employee ${lianda.id} (${lianda.data().name}) with exemption_days=[2] (terça-feira)`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
