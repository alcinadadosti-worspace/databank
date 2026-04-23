import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

async function main() {
  const [empSnap, leadSnap] = await Promise.all([
    db.collection('employees').get(),
    db.collection('leaders').get(),
  ]);

  const karine = empSnap.docs.find(d =>
    d.data().name?.toLowerCase().includes('karine celestino')
  );
  const emanoelle = empSnap.docs.find(d =>
    d.data().name?.toLowerCase().includes('emanoelle')
  );

  const erickCafe = leadSnap.docs.find(d =>
    d.data().name?.toLowerCase().includes('erick')
  );
  const joaoAntonio = leadSnap.docs.find(d =>
    d.data().name?.toLowerCase().includes('joao antonio')
  );

  console.log('Karine:', karine?.data().name, 'current leader_id:', karine?.data().leader_id);
  console.log('Emanoelle:', emanoelle?.data().name, 'current leader_id:', emanoelle?.data().leader_id);
  console.log('Erick Café:', erickCafe?.data().name, 'id:', erickCafe?.data().id);
  console.log('Joao Antonio:', joaoAntonio?.data().name, 'id:', joaoAntonio?.data().id);

  if (!karine || !emanoelle || !erickCafe || !joaoAntonio) {
    console.error('Não encontrou um dos registros');
    process.exit(1);
  }

  await Promise.all([
    db.collection('employees').doc(karine.id).update({ leader_id: erickCafe.data().id }),
    db.collection('employees').doc(emanoelle.id).update({ leader_id: joaoAntonio.data().id }),
  ]);

  console.log(`\n✓ ${karine.data().name} → ${erickCafe.data().name} (leader_id=${erickCafe.data().id})`);
  console.log(`✓ ${emanoelle.data().name} → ${joaoAntonio.data().name} (leader_id=${joaoAntonio.data().id})`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
