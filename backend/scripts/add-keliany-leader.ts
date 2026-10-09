import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();
const COMMIT = process.argv.includes('--commit');

// Keliany Cordeiro Da Silva vira líder (leader 18) — 2026-10-09
//  - Sólides ID 7103716, readmitida em 2026-10-09, recordsPunch=false (não bate ponto).
//    Mesmo gestor no Sólides que Kemilly/Taciane/Mariane → parent_leader_id 6 (Leidiane), setor Canal Loja.
//  - Assume da Kemilly (leader 10) as unidades virtuais Loja Palmeira dos Indios (4) e
//    Loja Sustentável Palmeira (2). Kemilly fica só com a Loja Sao Sebastiao, então o setor
//    dela sai de "Loja Sustentável Palmeira" e volta para "Canal Loja".
//  - Como as outras líderes de loja (Kemilly 47, Mariane 48, Taciane 49), ela também vira
//    employee sem ponto sob a Leidiane (leader 6, no_punch_required=true).
//  - Precisa do deploy de queries.ts (unidades virtuais em leader 18) e leaders.ts (login por email).
const KELIANY_LEADER_ID = 18;
const KELIANY_EMPLOYEE_ID = 129;
const KEMILLY_ID = 10;
const NAME = 'Keliany Cordeiro Da Silva';
const SLACK_ID = 'U0C7UTGSL3T';
const SOLIDES_ID = '7103716';

const leaderDoc = {
  id: KELIANY_LEADER_ID,
  name: NAME,
  name_normalized: NAME.toLowerCase(),
  slack_id: SLACK_ID,
  parent_leader_id: 6,
  sector: 'Canal Loja',
};

const employeeDoc = {
  id: KELIANY_EMPLOYEE_ID,
  name: NAME,
  slack_id: SLACK_ID,
  leader_id: 6,
  secondary_approver_id: null,
  solides_employee_id: SOLIDES_ID,
  is_apprentice: false,
  no_punch_required: true,
};

// Time que vem da Kemilly
const TEAM: Record<number, string> = {
  115: 'Edlane Silva de Lima',
  96: 'Maria Cicília Brito Veiga',
  54: 'Yasmin Abilia Ferro da Silva',
  114: 'Bruna Soares Siqueira',
  97: 'Eduarda Pereira Costa Silva',
  111: 'Luciene Tayná Félix da Silva',
};

async function main() {
  console.log(COMMIT ? '*** MODO COMMIT — vai gravar no Firestore ***\n' : '*** DRY-RUN (use --commit para gravar) ***\n');

  // 1) Checagens de segurança
  let abort = false;
  const leaders = await db.collection('leaders').get();
  const employees = await db.collection('employees').get();

  if ((await db.collection('leaders').doc(String(KELIANY_LEADER_ID)).get()).exists) { console.log(`❌ leaders/${KELIANY_LEADER_ID} JÁ EXISTE`); abort = true; }
  if ((await db.collection('employees').doc(String(KELIANY_EMPLOYEE_ID)).get()).exists) { console.log(`❌ employees/${KELIANY_EMPLOYEE_ID} JÁ EXISTE`); abort = true; }
  for (const d of leaders.docs) {
    if (d.data().slack_id === SLACK_ID) { console.log(`❌ slack ${SLACK_ID} já usado por leaders/${d.id}`); abort = true; }
    if (String(d.data().name).toLowerCase() === NAME.toLowerCase()) { console.log(`❌ nome já usado por leaders/${d.id}`); abort = true; }
  }
  for (const d of employees.docs) {
    const x = d.data();
    if (x.slack_id === SLACK_ID) { console.log(`❌ slack ${SLACK_ID} já usado por employees/${d.id}`); abort = true; }
    if (String(x.solides_employee_id) === SOLIDES_ID) { console.log(`❌ solides ${SOLIDES_ID} já usado por employees/${d.id}`); abort = true; }
    if (String(x.name).toLowerCase() === NAME.toLowerCase()) { console.log(`❌ nome já usado por employees/${d.id}`); abort = true; }
  }
  for (const [id, name] of Object.entries(TEAM)) {
    const x = employees.docs.find(d => d.id === id)?.data();
    if (!x) { console.log(`❌ employees/${id} (${name}) não existe`); abort = true; continue; }
    if (x.name !== name) { console.log(`❌ employees/${id} é "${x.name}", esperado "${name}"`); abort = true; }
    if (x.leader_id !== KEMILLY_ID) { console.log(`❌ employees/${id} (${name}) está com leader_id=${x.leader_id}, esperado ${KEMILLY_ID}`); abort = true; }
  }
  const kemilly = leaders.docs.find(d => d.id === String(KEMILLY_ID))?.data();
  if (!kemilly) { console.log('❌ leaders/10 (Kemilly) não existe'); abort = true; }
  if (abort) { console.log('\nProblema detectado. Nada foi gravado.'); process.exit(1); }
  console.log('Checagens OK ✓\n');

  // 2) Mostrar exatamente o que muda
  console.log(`CRIAR leaders/${KELIANY_LEADER_ID}:`);
  console.log(JSON.stringify({ ...leaderDoc, created_at: '<ISO now>' }, null, 2));
  console.log(`\nCRIAR employees/${KELIANY_EMPLOYEE_ID} (líder sem ponto, como Kemilly 47 / Mariane 48 / Taciane 49):`);
  console.log(JSON.stringify({ ...employeeDoc, created_at: '<ISO now>' }, null, 2));
  console.log(`\nMOVER leader_id ${KEMILLY_ID} → ${KELIANY_LEADER_ID}:`);
  for (const [id, name] of Object.entries(TEAM)) console.log(`  employees/${id} ${name}`);
  console.log(`\nATUALIZAR leaders/${KEMILLY_ID} (Kemilly) sector: "${kemilly!.sector}" → "Canal Loja"`);

  const remaining = employees.docs.filter(d => d.data().leader_id === KEMILLY_ID && !(d.id in TEAM));
  console.log(`\nKemilly continua com: ${remaining.map(d => `${d.id} ${d.data().name}`).join(', ')}`);

  if (!COMMIT) { console.log('\nDRY-RUN: nada gravado. Rode novamente com --commit.'); process.exit(0); }

  // 3) Gravar tudo numa transação (inclui os counters)
  const now = new Date().toISOString();
  await db.runTransaction(async (tx) => {
    const leadersCounterRef = db.collection('counters').doc('leaders');
    const employeesCounterRef = db.collection('counters').doc('employees');
    const [lc, ec] = await Promise.all([tx.get(leadersCounterRef), tx.get(employeesCounterRef)]);
    const lcur = lc.exists ? (lc.data()!.value as number) : 0;
    const ecur = ec.exists ? (ec.data()!.value as number) : 0;

    tx.create(db.collection('leaders').doc(String(KELIANY_LEADER_ID)), { ...leaderDoc, created_at: now });
    tx.create(db.collection('employees').doc(String(KELIANY_EMPLOYEE_ID)), { ...employeeDoc, created_at: now });
    for (const id of Object.keys(TEAM)) {
      tx.update(db.collection('employees').doc(id), { leader_id: KELIANY_LEADER_ID });
    }
    tx.update(db.collection('leaders').doc(String(KEMILLY_ID)), { sector: 'Canal Loja' });
    tx.set(leadersCounterRef, { value: Math.max(lcur, KELIANY_LEADER_ID) });
    tx.set(employeesCounterRef, { value: Math.max(ecur, KELIANY_EMPLOYEE_ID) });
    console.log(`counter leaders: ${lcur} -> ${Math.max(lcur, KELIANY_LEADER_ID)} | employees: ${ecur} -> ${Math.max(ecur, KELIANY_EMPLOYEE_ID)}`);
  });
  console.log('✓ Transação gravada');

  // 4) Ler de volta
  console.log('\n=== Verificação pós-gravação ===');
  console.log(`leaders/${KELIANY_LEADER_ID}:`, JSON.stringify((await db.collection('leaders').doc(String(KELIANY_LEADER_ID)).get()).data()));
  console.log(`employees/${KELIANY_EMPLOYEE_ID}:`, JSON.stringify((await db.collection('employees').doc(String(KELIANY_EMPLOYEE_ID)).get()).data()));
  console.log(`leaders/${KEMILLY_ID} sector:`, (await db.collection('leaders').doc(String(KEMILLY_ID)).get()).data()?.sector);
  for (const id of Object.keys(TEAM)) {
    const x = (await db.collection('employees').doc(id).get()).data()!;
    console.log(`  employees/${id} ${x.name} → leader_id=${x.leader_id}`);
  }

  console.log('\nConcluído. Cache de cadastro leva até 30 min p/ refletir no painel.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
