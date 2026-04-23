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

  const juliene = empSnap.docs.find(d =>
    d.data().name?.toLowerCase().includes('juliene')
  );

  const anaClaraLead = leadSnap.docs.find(d =>
    d.data().name?.toLowerCase().includes('ana clara')
  );

  console.log('Juliene:', juliene?.id, juliene?.data().name, 'current leader_id:', juliene?.data().leader_id);
  console.log('Ana Clara:', anaClaraLead?.id, anaClaraLead?.data().name, 'id field:', anaClaraLead?.data().id);

  if (!juliene || !anaClaraLead) {
    console.error('Não encontrou um dos dois');
    process.exit(1);
  }

  const anaId = anaClaraLead.data().id;
  await db.collection('employees').doc(juliene.id).update({ leader_id: anaId });
  console.log(`\n✓ ${juliene.data().name} → Ana Clara de Matos Chagas (leader_id=${anaId})`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
