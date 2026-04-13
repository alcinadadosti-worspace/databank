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

  const anny = empSnap.docs.find(d => d.data().name?.toLowerCase().includes('anny karoline'));

  const mariane = leadSnap.docs.find(d => {
    const name: string = d.data().name?.toLowerCase() ?? '';
    return name.includes('mariane') && name.includes('sousa');
  });

  console.log('Anny Karoline:', anny?.data().name, '| current leader_id:', anny?.data().leader_id);
  console.log('Mariane:', mariane?.data().name, '| id:', mariane?.data().id);

  if (!anny || !mariane) {
    console.error('Não foi possível encontrar todos os registros necessários');
    process.exit(1);
  }

  await anny.ref.update({ leader_id: mariane.data().id });
  console.log(`✓ ${anny.data().name} → gestora: ${mariane.data().name} (Loja Digital)`);

  console.log('\nConcluído!');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
