import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();
const COMMIT = process.argv.includes('--commit');

// Financeiro/Administrativo (leader 13) — 2026-10-05
//  - Michaell Jean Nunes De Carvalho foi readmitido (Sólides 7017733, admissão 2026-09-15) e volta
//    a liderar o time 13 no lugar do Tomás. Desfaz a troca de apply-changes-jun2026.ts.
//  - leaders/13 é atualizado in-place: o time inteiro (leader_id=13) passa p/ o Michaell sem mexer
//    nos employees. Slack U07P692F1FB (o mesmo de antes, confirmado pela gestão).
//  - Tomás (employee 65) já está no time 13 e já é cobrado pelo ponto → nada muda no doc dele.
//  - Michaell ganha registro de employee sem ponto (no_punch_required=true), como o antigo 85.
//  - Login de gestor (MANAGER_EMAILS em src/routes/leaders.ts) é troca de código → precisa deploy.
const MICHAELL = {
  id: 127,
  name: 'Michaell Jean Nunes De Carvalho',
  slack_id: 'U07P692F1FB',
  leader_id: 13,
  secondary_approver_id: null,
  solides_employee_id: '7017733',
  is_apprentice: false,
  expected_daily_minutes: 480,
  no_punch_required: true, // gestor, não bate ponto
  works_saturday: true,
};

const LEADER_13_UPDATE = {
  name: MICHAELL.name,
  name_normalized: MICHAELL.name.toLowerCase(),
  slack_id: MICHAELL.slack_id,
};

async function main() {
  console.log(COMMIT ? '*** MODO COMMIT — vai gravar no Firestore ***\n' : '*** DRY-RUN (use --commit para gravar) ***\n');

  // 1) Pré-condições
  let abort = false;
  const leaderRef = db.collection('leaders').doc('13');
  const leader = (await leaderRef.get()).data();
  if (!leader || leader.name !== 'Tomás Azevedo Santos' || leader.slack_id !== 'U081ZP68CA1') {
    console.log(`❌ leaders/13 não está como esperado (Tomás / U081ZP68CA1): ${JSON.stringify(leader)}`); abort = true;
  }

  const otherLeaders = (await db.collection('leaders').get()).docs.filter(d => d.id !== '13' && d.data().slack_id === MICHAELL.slack_id);
  if (otherLeaders.length) { console.log(`❌ slack ${MICHAELL.slack_id} já é de outro leader: ${otherLeaders.map(d => d.id).join(',')}`); abort = true; }

  const empSnap = await db.collection('employees').get();
  let maxId = 0;
  empSnap.docs.forEach(d => {
    const e = d.data();
    if (typeof e.id === 'number' && e.id > maxId) maxId = e.id;
    if (e.slack_id === MICHAELL.slack_id) { console.log(`❌ slack ${MICHAELL.slack_id} já usado por employee ${d.id}:${e.name}`); abort = true; }
    if (String(e.solides_employee_id) === MICHAELL.solides_employee_id) { console.log(`❌ solides ${MICHAELL.solides_employee_id} já usado por employee ${d.id}:${e.name}`); abort = true; }
    if (String(e.name).toLowerCase() === MICHAELL.name.toLowerCase()) { console.log(`❌ nome já usado por employee ${d.id}`); abort = true; }
  });
  const empRef = db.collection('employees').doc(String(MICHAELL.id));
  if ((await empRef.get()).exists) { console.log(`❌ employees/${MICHAELL.id} JÁ EXISTE`); abort = true; }

  // users é criado sozinho no /auth/identify; um doc antigo com esse slack devolveria papel errado
  const staleUsers = await db.collection('users').where('slack_id', '==', MICHAELL.slack_id).get();
  if (!staleUsers.empty) { console.log(`❌ já existe users com slack ${MICHAELL.slack_id}: ${staleUsers.docs.map(d => `${d.id}:${JSON.stringify(d.data())}`).join(' | ')}`); abort = true; }

  if (abort) { console.log('\nPré-condição falhou. Nada foi gravado.'); process.exit(1); }
  console.log('Pré-condições OK. ✓\n');

  // 2) Mostrar o que vai mudar
  const team = empSnap.docs.map(d => d.data()).filter(e => e.leader_id === 13);
  console.log(`leaders/13: ${leader!.name} (${leader!.slack_id}) → ${LEADER_13_UPDATE.name} (${LEADER_13_UPDATE.slack_id})`);
  console.log(`  update: ${JSON.stringify(LEADER_13_UPDATE)}`);
  console.log(`  time 13 que passa p/ o Michaell: ${team.map(e => `${e.id} ${e.name}`).join(' | ')}`);
  console.log(`\nemployees/${MICHAELL.id}:`);
  console.log(JSON.stringify({ ...MICHAELL, created_at: '<ISO now>' }, null, 2));
  console.log(`\nmaxId atual: ${maxId}. Counter será ajustado para >= ${MICHAELL.id}.\n`);

  if (!COMMIT) { console.log('DRY-RUN: nada gravado. Rode novamente com --commit.'); process.exit(0); }

  // 3) Gravar
  const now = new Date().toISOString();
  await leaderRef.update(LEADER_13_UPDATE);
  console.log(`✓ leaders/13 → ${LEADER_13_UPDATE.name}`);

  await empRef.set({ ...MICHAELL, created_at: now });
  console.log(`✓ employees/${MICHAELL.id} ${MICHAELL.name} (leader_id=13, no_punch_required=true)`);

  const counterRef = db.collection('counters').doc('employees');
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    const current = doc.exists ? (doc.data()!.value as number) : 0;
    const next = Math.max(current, MICHAELL.id);
    tx.set(counterRef, { value: next });
    console.log(`✓ counter employees: ${current} -> ${next}`);
  });

  await db.collection('audit_log').add({
    action: 'ADMIN_BATCH_UPDATE',
    actor: 'script:apply-michaell-leader-oct2026',
    timestamp: now,
    details: `Líder 13 (Financeiro) volta a ser Michaell Jean Nunes De Carvalho (slack ${MICHAELL.slack_id}) no lugar do Tomás Azevedo Santos, ` +
      `que segue como colaborador (employee 65) no time 13. Michaell cadastrado como employee ${MICHAELL.id} sem ponto (Sólides ${MICHAELL.solides_employee_id}).`,
  });
  console.log('✓ auditoria gravada');

  // 4) Ler de volta
  console.log('\n=== Verificação pós-gravação ===');
  console.log(JSON.stringify((await leaderRef.get()).data()));
  console.log(JSON.stringify((await empRef.get()).data()));

  console.log('\nConcluído. Cache de cadastro leva até 30 min p/ refletir no painel.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
