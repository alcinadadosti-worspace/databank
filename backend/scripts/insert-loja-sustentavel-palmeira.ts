import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

async function getNextId(collection: string): Promise<number> {
  const ref = db.collection('counters').doc(collection);
  return db.runTransaction(async tx => {
    const doc = await tx.get(ref);
    const next = (doc.exists ? (doc.data()!.value as number) : 0) + 1;
    tx.set(ref, { value: next });
    return next;
  });
}

const LEADER_ID = 10; // Kemilly Rafaelly Souza Silva

const novos = [
  {
    name: 'Maria Cicília Brito Veiga',
    solides_employee_id: '6162494',
    slack_id: 'U0AL2NDNH09',
  },
  {
    name: 'Eduarda Pereira Costa Silva',
    solides_employee_id: '6198626',
    slack_id: 'U0AKMS2LNEA',
  },
  {
    name: 'Larissa Alexia da Silva Souza',
    solides_employee_id: '6162496',
    slack_id: 'U0ALX1EJUC8',
  },
];

async function main() {
  const now = new Date().toISOString();

  // Atualiza setor da Kemilly para Loja Sustentável Palmeira
  const leaderSnap = await db.collection('leaders').where('id', '==', LEADER_ID).limit(1).get();
  if (!leaderSnap.empty) {
    await leaderSnap.docs[0].ref.update({ sector: 'Loja Sustentável Palmeira' });
    console.log('✓ Setor da Kemilly atualizado para: Loja Sustentável Palmeira\n');
  }

  for (const emp of novos) {
    // Verifica se já existe pelo solides_employee_id
    const existingSnap = await db.collection('employees')
      .where('solides_employee_id', '==', emp.solides_employee_id).limit(1).get();

    if (!existingSnap.empty) {
      const existingId = existingSnap.docs[0].data().id as number;
      console.log(`  já existe (ID ${existingId}): ${emp.name}`);
      continue;
    }

    const empId = await getNextId('employees');
    await db.collection('employees').doc(String(empId)).set({
      id: empId,
      name: emp.name,
      solides_employee_id: emp.solides_employee_id,
      slack_id: emp.slack_id,
      leader_id: LEADER_ID,
      secondary_approver_id: null,
      is_apprentice: false,
      expected_daily_minutes: 528,
      no_punch_required: false,
      works_saturday: true,
      created_at: now,
    });
    console.log(`  ✓ employee criado (ID ${empId}): ${emp.name} [solides: ${emp.solides_employee_id}]`);
  }

  console.log('\nConcluído!');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
