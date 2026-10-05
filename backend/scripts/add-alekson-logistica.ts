import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();
const COMMIT = process.argv.includes('--commit');
// Sem Slack: não bate ponto, então não recebe alerta nenhum.
const SLACK_ID: string | null = null;

// Cadastro Logistica (leader_id=2, Alberto Luiz Marinho Batista) — 2026-10-05
//  - Sólides ID 6871652, admissão 2026-08-14 (lastManager 0 no Sólides, time informado pela gestão).
//  - Não bate ponto (no_punch_required=true): vai para o card "Sem Ponto", então o split
//    Logistica Penedo/Palmeira (lista em src/models/queries.ts) não se aplica → sem deploy.
//  - Mesmo padrão do Alberto Guilherme (123), do mesmo time.
const newEmployees = [
  {
    id: 128,
    name: 'Alekson Fernandes Moura',
    slack_id: SLACK_ID,
    leader_id: 2,
    secondary_approver_id: null,
    solides_employee_id: '6871652',
    is_apprentice: false,
    expected_daily_minutes: 480,
    no_punch_required: true, // não bate ponto
    works_saturday: true,
  },
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

  let abort = false;
  for (const emp of newEmployees) {
    const existing = await db.collection('employees').doc(String(emp.id)).get();
    if (existing.exists) { console.log(`❌ doc ${emp.id} JÁ EXISTE: ${JSON.stringify(existing.data())}`); abort = true; }
    if (emp.slack_id && slackInUse.has(emp.slack_id)) { console.log(`❌ slack_id ${emp.slack_id} já usado por ${slackInUse.get(emp.slack_id)}`); abort = true; }
    if (solidesInUse.has(emp.solides_employee_id)) { console.log(`❌ solides ${emp.solides_employee_id} já usado por ${solidesInUse.get(emp.solides_employee_id)}`); abort = true; }
    if (nameInUse.has(emp.name.toLowerCase())) { console.log(`❌ nome ${emp.name} já usado por ${nameInUse.get(emp.name.toLowerCase())}`); abort = true; }
  }
  if (abort) { console.log('\nColisão detectada. Nada foi gravado.'); process.exit(1); }
  console.log('Nenhuma colisão. ✓\n');

  // 2) Mostrar o payload exato
  for (const emp of newEmployees) {
    console.log(`employees/${emp.id}:`);
    console.log(JSON.stringify({ ...emp, created_at: '<ISO now>' }, null, 2));
  }
  console.log(`\nmaxId atual: ${maxId}. Counter será ajustado para >= ${MAX_NEW_ID}.\n`);

  if (!COMMIT) { console.log('DRY-RUN: nada gravado. Rode novamente com --commit.'); process.exit(0); }

  // 3) Gravar
  for (const emp of newEmployees) {
    await db.collection('employees').doc(String(emp.id)).set({ ...emp, created_at: new Date().toISOString() });
    console.log(`✓ ${emp.name} (id ${emp.id}, leader_id=${emp.leader_id}, solides=${emp.solides_employee_id})`);
  }

  // 4) Ajustar o counter para não colidir em criações futuras (getNextId)
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

  console.log('\nConcluído. Cache de cadastro leva até 30 min p/ refletir no painel.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
