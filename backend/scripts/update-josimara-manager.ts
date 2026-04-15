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

  const josimara = empSnap.docs.find(d => d.data().name?.toLowerCase().includes('josimara ferreira monteiro'));

  const anaClara = leadSnap.docs.find(d => {
    const name: string = d.data().name?.toLowerCase() ?? '';
    return name.includes('ana clara de matos chagas');
  });

  console.log('Josimara:', josimara?.data().name, '| current leader_id:', josimara?.data().leader_id);
  console.log('Ana Clara leader:', anaClara?.data().name, '| id:', anaClara?.data().id);

  if (!josimara || !anaClara) {
    console.error('Não foi possível encontrar todos os registros necessários');
    process.exit(1);
  }

  await josimara.ref.update({ leader_id: anaClara.data().id });
  console.log(`✓ ${josimara.data().name} → gestor: ${anaClara.data().name}`);

  console.log('\nConcluído!');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
