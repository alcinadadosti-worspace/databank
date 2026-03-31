import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

const TARGETS = ['lucrecia', 'lucrécia', 'severo', 'thalita'];

async function main() {
  const snap = await db.collection('employees').get();
  const all = snap.docs.map(d => ({ ref: d.ref, data: d.data() }));

  const found = all.filter(({ data }) =>
    TARGETS.some(t => data.name?.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(t.normalize('NFD').replace(/[\u0300-\u036f]/g, '')))
  );

  if (found.length === 0) {
    console.log('Nenhum colaborador encontrado com esses nomes.');
    console.log('\nTodos os colaboradores:');
    all.forEach(({ data }) => console.log(`  ID ${data.id}: ${data.name}`));
    process.exit(0);
  }

  console.log(`Encontrados ${found.length} colaborador(es):`);
  for (const { ref, data } of found) {
    console.log(`  ID ${data.id}: ${data.name} [solides: ${data.solides_employee_id}]`);
  }

  const DRY_RUN = process.argv[2] !== '--confirm';
  if (DRY_RUN) {
    console.log('\n[DRY RUN] Para confirmar a exclusão, rode com --confirm');
    process.exit(0);
  }

  for (const { ref, data } of found) {
    await ref.delete();
    console.log(`  ✓ Deletado: ${data.name} (ID ${data.id})`);
  }

  console.log('\nConcluído!');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
