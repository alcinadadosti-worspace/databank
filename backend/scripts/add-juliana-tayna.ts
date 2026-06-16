import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();
const COMMIT = process.argv.includes('--commit');

// Confirmado com a gestão (2026-06-16):
//  - Juliana -> Jonathan (leader_id=4, "VD Palmeira dos Indios"), jornada 480 Seg-Sex + sábado 4h
//  - Tayná   -> Kemilly (leader_id=10, "Loja Sustentável Palmeira"), rodízio (constants.ts LOJA_SUSTENTAVEL_EMPLOYEES)
const newEmployees = [
  {
    id: 110,
    name: 'Juliana Francine Marques da Silva',
    slack_id: 'U0BAT0U8DS5',
    leader_id: 4,
    secondary_approver_id: null,
    solides_employee_id: '6573320',
    is_apprentice: false,
    expected_daily_minutes: 480, // 8h Seg-Sex; sábado usa getSaturdayMinutes (240)
    no_punch_required: false,
    works_saturday: true,
  },
  {
    id: 111,
    name: 'Luciene Tayná Félix da Silva',
    slack_id: 'U0BA9MCGX6K',
    leader_id: 10,
    secondary_approver_id: null,
    solides_employee_id: '6571930',
    is_apprentice: false,
    expected_daily_minutes: 528, // espelha Eduarda; cálculo real vem do rodízio Sustentável (720/660)
    no_punch_required: false,
    works_saturday: true,
  },
];

async function main() {
  console.log(COMMIT ? '*** MODO COMMIT — vai gravar no Firestore ***\n' : '*** DRY-RUN (use --commit para gravar) ***\n');

  // 1) Checagem de segurança: nenhum doc/id/slack pode colidir
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
    const docRef = db.collection('employees').doc(String(emp.id));
    const existing = await docRef.get();
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

  // 2) Mostrar o payload exato
  for (const emp of newEmployees) {
    console.log(`Vai gravar employees/${emp.id}:`);
    console.log(JSON.stringify({ ...emp, created_at: '<ISO now>' }, null, 2));
    console.log();
  }
  console.log(`maxId atual no Firestore: ${maxId}. Counter de employees será ajustado para >= 111.\n`);

  if (!COMMIT) { console.log('DRY-RUN: nada gravado. Rode novamente com --commit.'); process.exit(0); }

  // 3) Gravar (set) cada colaborador
  for (const emp of newEmployees) {
    await db.collection('employees').doc(String(emp.id)).set({
      ...emp,
      created_at: new Date().toISOString(),
    });
    console.log(`✓ ${emp.name} criado (id ${emp.id}, leader_id=${emp.leader_id}, solides=${emp.solides_employee_id})`);
  }

  // 4) Ajustar o counter para não colidir em criações futuras (getNextId)
  const counterRef = db.collection('counters').doc('employees');
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    const current = doc.exists ? (doc.data()!.value as number) : 0;
    const next = Math.max(current, 111);
    tx.set(counterRef, { value: next });
    console.log(`✓ counter employees: ${current} -> ${next}`);
  });

  // 5) Ler de volta para confirmar
  console.log('\n=== Verificação pós-gravação ===');
  for (const emp of newEmployees) {
    const d = await db.collection('employees').doc(String(emp.id)).get();
    console.log(JSON.stringify(d.data()));
  }

  console.log('\nConcluído.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
