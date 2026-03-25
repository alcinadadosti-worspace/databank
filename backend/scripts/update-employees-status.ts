import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

function normalize(name: string) {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

const toDelete = [
  'David da Silva Bento',
  'Joyce cassimiro souto',
  'Alyni Mayara Farias Da Silva Santos',
];

const toNoPunch = [
  'Maria Taciane Pereira Barbosa',
  'Kemilly Rafaelly Souza Silva',
  'Sabrina Domingos Santos',
];

async function main() {
  const empSnap = await db.collection('employees').get();
  const employees = empSnap.docs.map(d => ({ docId: d.id, ...d.data() as { id: number; name: string; solides_employee_id: string | null } }));

  console.log('\n=== Removendo demitidos ===');
  for (const name of toDelete) {
    const emp = employees.find(e => normalize(e.name) === normalize(name));
    if (!emp) { console.log(`  ❌ não encontrado: ${name}`); continue; }

    // Remove vacation_schedule se existir
    const vsSnap = await db.collection('vacation_schedules').where('employee_id', '==', emp.id).get();
    for (const doc of vsSnap.docs) {
      await doc.ref.delete();
      console.log(`  🗑 vencimento removido: ${emp.name}`);
    }

    await db.collection('employees').doc(emp.docId).delete();
    console.log(`  ✓ employee removido: ${emp.name} (ID ${emp.id})`);
  }

  console.log('\n=== Movendo para sem ponto ===');
  for (const name of toNoPunch) {
    const emp = employees.find(e => normalize(e.name) === normalize(name));
    if (!emp) { console.log(`  ❌ não encontrado: ${name}`); continue; }

    await db.collection('employees').doc(emp.docId).update({ solides_employee_id: null });
    console.log(`  ✓ solides_employee_id removido: ${emp.name} (ID ${emp.id})`);
  }

  console.log('\nConcluído!');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
