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

const LEADER_ID = 4; // Jonathan Henrique da Conceição Silva — VD Palmeira dos Indios

const novos = [
  {
    name: 'Lays da Silva Vieira',
    solides_employee_id: '6184556',
    slack_id: 'U0AKHDX4G83',
  },
  {
    name: 'Marília Alice dos Santos Silva',
    solides_employee_id: '6198672',
    slack_id: 'U0AKMRS669L',
  },
];

async function main() {
  const now = new Date().toISOString();

  for (const emp of novos) {
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
