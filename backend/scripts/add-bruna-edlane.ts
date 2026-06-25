import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();
const COMMIT = process.argv.includes('--commit');

// Loja Palmeira dos Indios (Kemilly, leader_id=10). Solides confirmados (find-all):
//  - Bruna Soares Siqueira  -> Solides 6653499
//  - Edlane Silva de Lima   -> Solides 6653525
// Jornada padrão da loja: 480 min Seg-Sex + sábado 08:00–14:00 (360 min via
// EXTENDED_SATURDAY_EMPLOYEES em constants.ts — nomes já adicionados lá).
const newEmployees = [
  {
    id: 114,
    name: 'Bruna Soares Siqueira',
    slack_id: 'U0BD3P15E2J',
    leader_id: 10,
    secondary_approver_id: null,
    solides_employee_id: '6653499',
    is_apprentice: false,
    expected_daily_minutes: 480,
    no_punch_required: false,
    works_saturday: true,
  },
  {
    id: 115,
    name: 'Edlane Silva de Lima',
    slack_id: 'U0BDA1F9PLL',
    leader_id: 10,
    secondary_approver_id: null,
    solides_employee_id: '6653525',
    is_apprentice: false,
    expected_daily_minutes: 480,
    no_punch_required: false,
    works_saturday: true,
  },
];

async function main() {
  console.log(COMMIT ? '*** MODO COMMIT — vai gravar no Firestore ***\n' : '*** DRY-RUN (use --commit para gravar) ***\n');

  const snap = await db.collection('employees').get();
  let maxId = 0;
  const slackInUse = new Map<string, string>();
  snap.docs.forEach(d => {
    const data = d.data();
    if (typeof data.id === 'number' && data.id > maxId) maxId = data.id;
    if (data.slack_id) slackInUse.set(data.slack_id, `${d.id}:${data.name}`);
  });

  let abort = false;
  for (const emp of newEmployees) {
    const existing = await db.collection('employees').doc(String(emp.id)).get();
    if (existing.exists) {
      console.log(`❌ doc ${emp.id} JÁ EXISTE: ${JSON.stringify(existing.data())} — abortando`);
      abort = true;
    }
    if (slackInUse.has(emp.slack_id)) {
      console.log(`❌ slack_id ${emp.slack_id} já usado por ${slackInUse.get(emp.slack_id)} — abortando`);
      abort = true;
    }
  }
  if (abort) { console.log('\nNada foi gravado.'); process.exit(1); }

  for (const emp of newEmployees) {
    console.log(`Vai gravar employees/${emp.id}:`);
    console.log(JSON.stringify({ ...emp, created_at: '<ISO now>' }, null, 2));
    console.log();
  }
  const nextCounter = Math.max(maxId, ...newEmployees.map(e => e.id));
  console.log(`maxId atual no Firestore: ${maxId}. Counter de employees será ajustado para >= ${nextCounter}.\n`);

  if (!COMMIT) { console.log('DRY-RUN: nada gravado. Rode novamente com --commit.'); process.exit(0); }

  for (const emp of newEmployees) {
    await db.collection('employees').doc(String(emp.id)).set({
      ...emp,
      created_at: new Date().toISOString(),
    });
    console.log(`✓ ${emp.name} criado (id ${emp.id}, leader_id=${emp.leader_id}, solides=${emp.solides_employee_id})`);
  }

  const counterRef = db.collection('counters').doc('employees');
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    const current = doc.exists ? (doc.data()!.value as number) : 0;
    const next = Math.max(current, nextCounter);
    tx.set(counterRef, { value: next });
    console.log(`✓ counter employees: ${current} -> ${next}`);
  });

  console.log('\n=== Verificação pós-gravação ===');
  for (const emp of newEmployees) {
    const d = await db.collection('employees').doc(String(emp.id)).get();
    console.log(JSON.stringify(d.data()));
  }

  console.log('\nConcluído.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
