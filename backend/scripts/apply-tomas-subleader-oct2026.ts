import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();
const COMMIT = process.argv.includes('--commit');

// Financeiro — 2026-10-05 (complementa apply-michaell-leader-oct2026.ts)
//  - Tomás ajusta o ponto do time todo; o Michaell (leader 13) ajusta só o do Tomás.
//  - O painel dá acesso por leader_id (ou secondary_approver_id), então o Tomás vira
//    sub-líder: leaders/17, parent_leader_id=13. Não usa 16: está em HIDDEN_LEADER_IDS.
//  - Sione (108), Amanda (44), Maria Nobre (66) e Luís Henrique (70): leader_id 13 → 17
//    (alertas do Slack passam a ir p/ o Tomás). Tomás (65) e Michaell (127) ficam no 13.
//  - A aba Unidades junta o 17 no 13 (src/models/queries.ts), igual ao Marketing 16 → 15;
//    o login do Tomás volta p/ MANAGER_EMAILS. As duas coisas só valem após deploy.
const TOMAS_LEADER = {
  id: 17,
  name: 'Tomás Azevedo Santos',
  name_normalized: 'tomás azevedo santos',
  slack_id: 'U081ZP68CA1',
  parent_leader_id: 13,
  sector: 'Alta Lideranca', // mesmo setor do leader 13, p/ o time não mudar de setor no painel
};
const MOVE_TO_TOMAS = [108, 44, 66, 70];
const STAY_WITH_MICHAELL = [65, 127];

async function main() {
  console.log(COMMIT ? '*** MODO COMMIT — vai gravar no Firestore ***\n' : '*** DRY-RUN (use --commit para gravar) ***\n');

  // 1) Pré-condições
  let abort = false;
  const leaderRef = db.collection('leaders').doc(String(TOMAS_LEADER.id));
  if ((await leaderRef.get()).exists) { console.log(`❌ leaders/${TOMAS_LEADER.id} JÁ EXISTE`); abort = true; }

  const leaders = (await db.collection('leaders').get()).docs.map(d => d.data());
  const l13 = leaders.find(l => l.id === 13);
  if (l13?.name !== 'Michaell Jean Nunes De Carvalho') { console.log(`❌ leader 13 não é o Michaell: ${l13?.name}`); abort = true; }
  const sameSlack = leaders.filter(l => l.slack_id === TOMAS_LEADER.slack_id);
  if (sameSlack.length) { console.log(`❌ slack ${TOMAS_LEADER.slack_id} já é do leader ${sameSlack.map(l => l.id).join(',')}`); abort = true; }

  const emps = new Map<number, any>();
  for (const id of [...MOVE_TO_TOMAS, ...STAY_WITH_MICHAELL]) {
    const e = (await db.collection('employees').doc(String(id)).get()).data();
    if (!e) { console.log(`❌ employees/${id} não existe`); abort = true; continue; }
    if (e.leader_id !== 13) { console.log(`❌ employees/${id} ${e.name} não está no leader 13 (está em ${e.leader_id})`); abort = true; }
    emps.set(id, e);
  }
  const team13 = (await db.collection('employees').where('leader_id', '==', 13).get()).docs.map(d => d.data().id as number);
  const unexpected = team13.filter(id => !MOVE_TO_TOMAS.includes(id) && !STAY_WITH_MICHAELL.includes(id));
  if (unexpected.length) { console.log(`❌ time 13 tem gente fora do plano: ${unexpected.join(',')}`); abort = true; }

  if (abort) { console.log('\nPré-condição falhou. Nada foi gravado.'); process.exit(1); }
  console.log('Pré-condições OK. ✓\n');

  // 2) Mostrar o que vai mudar
  console.log(`leaders/${TOMAS_LEADER.id} (novo):`);
  console.log(JSON.stringify({ ...TOMAS_LEADER, created_at: '<ISO now>' }, null, 2));
  console.log('\nleader_id 13 → 17 (Tomás ajusta):');
  MOVE_TO_TOMAS.forEach(id => console.log(`  [${id}] ${emps.get(id).name}`));
  console.log('Ficam no 13 (Michaell ajusta):');
  STAY_WITH_MICHAELL.forEach(id => console.log(`  [${id}] ${emps.get(id).name}${emps.get(id).no_punch_required ? ' (sem ponto)' : ''}`));
  console.log('');

  if (!COMMIT) { console.log('DRY-RUN: nada gravado. Rode novamente com --commit.'); process.exit(0); }

  // 3) Gravar
  const now = new Date().toISOString();
  await leaderRef.set({ ...TOMAS_LEADER, created_at: now });
  console.log(`✓ leaders/${TOMAS_LEADER.id} ${TOMAS_LEADER.name} (parent 13)`);

  const counterRef = db.collection('counters').doc('leaders');
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    const current = doc.exists ? (doc.data()!.value as number) : 0;
    const next = Math.max(current, TOMAS_LEADER.id);
    tx.set(counterRef, { value: next });
    console.log(`✓ counter leaders: ${current} -> ${next}`);
  });

  for (const id of MOVE_TO_TOMAS) {
    await db.collection('employees').doc(String(id)).update({ leader_id: TOMAS_LEADER.id });
    console.log(`✓ employees/${id} ${emps.get(id).name}: leader_id 13 → ${TOMAS_LEADER.id}`);
  }

  await db.collection('audit_log').add({
    action: 'ADMIN_BATCH_UPDATE',
    actor: 'script:apply-tomas-subleader-oct2026',
    timestamp: now,
    details: `Tomás Azevedo Santos vira sub-líder do Financeiro (leader ${TOMAS_LEADER.id}, parent 13) e ajusta o ponto de ` +
      `${MOVE_TO_TOMAS.join(', ')}; Michaell (leader 13) fica só com o Tomás (65).`,
  });
  console.log('✓ auditoria gravada');

  // 4) Ler de volta
  console.log('\n=== Verificação pós-gravação ===');
  console.log(JSON.stringify((await leaderRef.get()).data()));
  for (const id of [...MOVE_TO_TOMAS, ...STAY_WITH_MICHAELL]) {
    const e = (await db.collection('employees').doc(String(id)).get()).data()!;
    console.log(`  [${id}] ${e.name} → leader_id ${e.leader_id}`);
  }

  console.log('\nConcluído. Cache de cadastro leva até 30 min p/ refletir no painel.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
