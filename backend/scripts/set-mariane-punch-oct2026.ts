import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();
const COMMIT = process.argv.includes('--commit');

// Mariane Santos Sousa (employee 48, líder da Loja Digital = leaders/12) — 2026-10-13
//  - Volta a bater ponto: no_punch_required true → false (desfaz set-no-punch-mariane.ts).
//  - Quem ajusta o ponto dela é a Leidiane: o painel só deixa ajustar quem é o leader_id
//    (ou secondary_approver_id) do colaborador, e o employees/48 já está com leader_id=6.
//    Como leaders/12 não é o leader_id dela, a Mariane não ajusta o próprio ponto.
//  - Na aba Unidades ela aparece na Loja Digital via STORE_LEADER_MAPPING (queries.ts);
//    jornada padrão 480 seg-sex + 240 sáb. Nada disso precisa de deploy.
const EMP_ID = 48;
const LEIDIANE_LEADER_ID = 6;

async function main() {
  console.log(COMMIT ? '*** MODO COMMIT — vai gravar no Firestore ***\n' : '*** DRY-RUN (use --commit para gravar) ***\n');

  // 1) Pré-condições
  let abort = false;
  const empRef = db.collection('employees').doc(String(EMP_ID));
  const emp = (await empRef.get()).data();
  const leidiane = (await db.collection('leaders').doc(String(LEIDIANE_LEADER_ID)).get()).data();

  if (emp?.name !== 'Mariane Santos Sousa') { console.log(`❌ employees/${EMP_ID} não é a Mariane: ${emp?.name}`); abort = true; }
  if (emp && emp.leader_id !== LEIDIANE_LEADER_ID) { console.log(`❌ employees/${EMP_ID} está no leader ${emp.leader_id}, esperado ${LEIDIANE_LEADER_ID}`); abort = true; }
  if (emp?.secondary_approver_id != null) { console.log(`❌ employees/${EMP_ID} tem secondary_approver_id=${emp.secondary_approver_id}`); abort = true; }
  if (emp?.alert_cover_leader_id != null) { console.log(`❌ employees/${EMP_ID} tem alert_cover_leader_id=${emp.alert_cover_leader_id}`); abort = true; }
  if (leidiane?.name !== 'Leidiane Souza') { console.log(`❌ leaders/${LEIDIANE_LEADER_ID} não é a Leidiane: ${leidiane?.name}`); abort = true; }
  if (!leidiane?.slack_id) { console.log(`❌ leaders/${LEIDIANE_LEADER_ID} sem slack_id (alertas não chegariam)`); abort = true; }
  if (leidiane?.cover_leader_id != null) { console.log(`⚠ leaders/${LEIDIANE_LEADER_ID} tem cover_leader_id=${leidiane.cover_leader_id} — alertas iriam p/ o cover`); abort = true; }
  if (!emp?.solides_employee_id) { console.log(`❌ employees/${EMP_ID} sem solides_employee_id (sync não puxaria as batidas)`); abort = true; }

  if (abort) { console.log('\nPré-condição falhou. Nada foi gravado.'); process.exit(1); }
  console.log('Pré-condições OK. ✓\n');

  // 2) Mostrar o que vai mudar
  console.log(`employees/${EMP_ID} ${emp!.name} (Sólides ${emp!.solides_employee_id}, slack ${emp!.slack_id})`);
  console.log(`  no_punch_required: ${emp!.no_punch_required} → false`);
  console.log(`  leader_id: ${emp!.leader_id} (${leidiane!.name}, slack ${leidiane!.slack_id}) — sem mudança`);
  if (emp!.no_punch_required === false) { console.log('\nJá está com no_punch_required=false. Nada a fazer.'); process.exit(0); }
  console.log('');

  if (!COMMIT) { console.log('DRY-RUN: nada gravado. Rode novamente com --commit.'); process.exit(0); }

  // 3) Gravar
  const now = new Date().toISOString();
  await empRef.update({ no_punch_required: false });
  console.log(`✓ employees/${EMP_ID}: no_punch_required → false`);

  await db.collection('audit_log').add({
    action: 'ADMIN_BATCH_UPDATE',
    actor: 'script:set-mariane-punch-oct2026',
    timestamp: now,
    details: `Mariane Santos Sousa (emp ${EMP_ID}) volta a bater ponto a partir de 2026-10-13 ` +
      `(no_punch_required true → false); ajustes e alertas com a Leidiane (leader ${LEIDIANE_LEADER_ID}).`,
  });
  console.log('✓ auditoria gravada');

  // 4) Ler de volta
  const after = (await empRef.get()).data()!;
  console.log(`\n=== Verificação ===\n  [${EMP_ID}] ${after.name} no_punch_required=${after.no_punch_required} leader_id=${after.leader_id}`);
  console.log('\nConcluído. Cache de cadastro leva até 30 min p/ refletir no painel e nos alertas.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
