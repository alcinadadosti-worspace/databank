import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

const NAMES_TO_DELETE = [
  'cristielle pereira lima da silva',
  'maria tatiane basto cardoso',
];

function matchesTarget(name: string): boolean {
  const normalized = name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return NAMES_TO_DELETE.some(target => {
    const targetNorm = target.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return targetNorm.split(' ').every(part => normalized.includes(part));
  });
}

async function main() {
  const snap = await db.collection('employees').get();
  const toDelete: { id: string; name: string }[] = [];

  snap.docs.forEach(d => {
    const data = d.data();
    if (matchesTarget(data.name || '')) {
      toDelete.push({ id: d.id, name: data.name });
    }
  });

  if (toDelete.length === 0) {
    console.log('Nenhum colaborador encontrado com esses nomes.');
    process.exit(0);
  }

  console.log('Colaboradores encontrados para deletar:');
  toDelete.forEach(e => console.log(`  [${e.id}] ${e.name}`));

  for (const emp of toDelete) {
    await db.collection('employees').doc(emp.id).delete();
    console.log(`Deletado: [${emp.id}] ${emp.name}`);
  }

  console.log('\nConcluído. Total removido:', toDelete.length);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
