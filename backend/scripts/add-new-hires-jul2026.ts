import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();
const COMMIT = process.argv.includes('--commit');

// Novos colaboradores — 2026-07-13 (confirmado com a gestão).
// Padrão: jornada 480 Seg-Sex; sábado via getSaturdayMinutes (240). works_saturday=true p/ todos.
// solides_employee_id obtido pela API Sólides (find-all por nome), então o ponto sincroniza por ID.
// ATENÇÃO Jayane (Loja Teotonio Vilela) é unidade VIRTUAL: o nome (lowercase) foi adicionado
//   a LOJA_TEOTONIO_VILELA_EMPLOYEES em src/models/queries.ts. SEM esse array + deploy, ela
//   não aparece na unidade Teotonio. Alertas do time 11 vão p/ Kemilly (cover_leader_id).
const newEmployees = [
  { id: 116, name: 'Amanda de Araújo Santos',            slack_id: 'U0BGA5QHHLJ', leader_id: 9,  secondary_approver_id: null, solides_employee_id: '6707708', is_apprentice: false, expected_daily_minutes: 480, no_punch_required: false, works_saturday: true },
  { id: 117, name: 'Auda da Conceição Santos',           slack_id: 'U0BG84A7VF0', leader_id: 9,  secondary_approver_id: null, solides_employee_id: '6707690', is_apprentice: false, expected_daily_minutes: 480, no_punch_required: false, works_saturday: true },
  { id: 118, name: 'Tayna Monaisa Vasconcelos Santos',   slack_id: 'U0BG84EDWVC', leader_id: 9,  secondary_approver_id: null, solides_employee_id: '6707384', is_apprentice: false, expected_daily_minutes: 480, no_punch_required: false, works_saturday: true },
  { id: 119, name: 'Crislaine Freire dos Santos',        slack_id: 'U0BFUPEQ6B1', leader_id: 3,  secondary_approver_id: null, solides_employee_id: '6697469', is_apprentice: false, expected_daily_minutes: 480, no_punch_required: false, works_saturday: true },
  { id: 120, name: 'Jayane da Silva Dias',               slack_id: 'U0BGC241S81', leader_id: 11, secondary_approver_id: null, solides_employee_id: '6709153', is_apprentice: false, expected_daily_minutes: 480, no_punch_required: false, works_saturday: true },
  { id: 121, name: 'Juliene Reis Ferreira',              slack_id: 'U0BGDSAR0VA', leader_id: 12, secondary_approver_id: null, solides_employee_id: '6707696', is_apprentice: false, expected_daily_minutes: 480, no_punch_required: false, works_saturday: true },
  { id: 122, name: 'Sabrina Barbosa Machado Mariano',    slack_id: 'U0BFUP30DEK', leader_id: 15, secondary_approver_id: null, solides_employee_id: '6706014', is_apprentice: false, expected_daily_minutes: 480, no_punch_required: false, works_saturday: true },
];

const MAX_NEW_ID = Math.max(...newEmployees.map(e => e.id));

async function main() {
  console.log(COMMIT ? '*** MODO COMMIT — vai gravar no Firestore ***\n' : '*** DRY-RUN (use --commit para gravar) ***\n');

  // 1) Checagem de segurança: nenhum doc/id/slack/solides/nome pode colidir
  const snap = await db.collection('employees').get();
  let maxId = 0;
  const slackInUse = new Map<string, string>();
  const solidesInUse = new Map<string, string>();
  const nameInUse = new Map<string, string>();
  snap.docs.forEach(d => {
    const data = d.data();
    if (typeof data.id === 'number' && data.id > maxId) maxId = data.id;
    if (data.slack_id) slackInUse.set(data.slack_id, `${d.id}:${data.name}`);
    if (data.solides_employee_id) solidesInUse.set(String(data.solides_employee_id), `${d.id}:${data.name}`);
    if (data.name) nameInUse.set(String(data.name).toLowerCase(), `${d.id}:${data.name}`);
  });

  // detectar duplicatas dentro do próprio lote
  const seenId = new Set<number>(), seenSlack = new Set<string>(), seenSolides = new Set<string>();
  let abort = false;
  for (const emp of newEmployees) {
    if (seenId.has(emp.id)) { console.log(`❌ id ${emp.id} repetido no lote`); abort = true; }
    if (seenSlack.has(emp.slack_id)) { console.log(`❌ slack ${emp.slack_id} repetido no lote`); abort = true; }
    if (seenSolides.has(emp.solides_employee_id)) { console.log(`❌ solides ${emp.solides_employee_id} repetido no lote`); abort = true; }
    seenId.add(emp.id); seenSlack.add(emp.slack_id); seenSolides.add(emp.solides_employee_id);

    const existing = await db.collection('employees').doc(String(emp.id)).get();
    if (existing.exists) { console.log(`❌ doc ${emp.id} JÁ EXISTE: ${JSON.stringify(existing.data())}`); abort = true; }
    if (slackInUse.has(emp.slack_id)) { console.log(`❌ slack_id ${emp.slack_id} já usado por ${slackInUse.get(emp.slack_id)}`); abort = true; }
    if (solidesInUse.has(emp.solides_employee_id)) { console.log(`❌ solides ${emp.solides_employee_id} já usado por ${solidesInUse.get(emp.solides_employee_id)}`); abort = true; }
    if (nameInUse.has(emp.name.toLowerCase())) { console.log(`❌ nome ${emp.name} já usado por ${nameInUse.get(emp.name.toLowerCase())}`); abort = true; }
  }
  if (abort) { console.log('\nColisão detectada. Nada foi gravado.'); process.exit(1); }
  console.log('Nenhuma colisão. ✓\n');

  // 2) Mostrar o payload exato
  for (const emp of newEmployees) {
    console.log(`employees/${emp.id}: ${JSON.stringify({ ...emp, created_at: '<ISO now>' })}`);
  }
  console.log(`\nmaxId atual: ${maxId}. Counter será ajustado para >= ${MAX_NEW_ID}.\n`);

  if (!COMMIT) { console.log('DRY-RUN: nada gravado. Rode novamente com --commit.'); process.exit(0); }

  // 3) Gravar (set) cada colaborador
  for (const emp of newEmployees) {
    await db.collection('employees').doc(String(emp.id)).set({ ...emp, created_at: new Date().toISOString() });
    console.log(`✓ ${emp.name} (id ${emp.id}, leader_id=${emp.leader_id}, solides=${emp.solides_employee_id})`);
  }

  // 4) Ajustar o counter (getNextId) para não colidir em criações futuras
  const counterRef = db.collection('counters').doc('employees');
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    const current = doc.exists ? (doc.data()!.value as number) : 0;
    const next = Math.max(current, MAX_NEW_ID);
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
