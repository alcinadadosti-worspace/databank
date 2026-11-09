import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

/**
 * Gente e Cultura (RH) — 2026-11-09. Rafaela Alves Mendes (leader 14) foi desligada; o Michaell
 * (leader 13) assume o time de RH e continua com o Tomás.
 *  - Letícia (71) e Millena (72): leader_id 14 → 13 e unit_name 'Gente e Cultura' (o card continua
 *    existindo, agora do Michaell; vale após o deploy de UNIT_OPTIONS_BY_LEADER[13]). Ajustes pendentes,
 *    folgas e alertas seguem o leader_id do colaborador, então passam p/ o Michaell.
 *  - Rafaela como colaboradora (employee 89, sem ponto, leader null): removida com o vencimento de férias,
 *    mesmo fluxo dos demitidos. Histórico fica.
 *  - leaders/14 NÃO é apagado (histórico). Fica oculto pelo HIDDEN_LEADER_IDS e o e-mail sai de
 *    MANAGER_EMAILS — as duas coisas só valem após o deploy do backend.
 * Nada aqui manda mensagem no Slack.
 *
 * Uso: npx tsx scripts/apply-rh-michaell-nov2026.ts                      (simulação)
 *      npx tsx scripts/apply-rh-michaell-nov2026.ts --commit --backup=arquivo.json
 */
const COMMIT = process.argv.includes('--commit');
const BACKUP = process.argv.find(a => a.startsWith('--backup='))?.slice('--backup='.length);

const MICHAELL = { id: 13, name: 'Michaell Jean Nunes De Carvalho', slack_id: 'U07P692F1FB' };
const RAFAELA_LEADER = { id: 14, name: 'Rafaela Alves Mendes' };
const MOVE = [
  { id: 71, name: 'Letícia Soares Belo' },
  { id: 72, name: 'Millena Sthefany dos Santos Cruz' },
];
const UNIT_NAME = 'Gente e Cultura';
const RAFAELA_EMPLOYEE = { id: 89, name: 'RAFAELA ALVES MENDES' };

const norm = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Sólides, só leitura: procura pelo nome nas listas de ativos e demitidos */
async function solidesByName(fragment: string): Promise<string> {
  const found: string[] = [];
  for (const showFired of ['false', 'true']) {
    const url = new URL('https://employer.tangerino.com.br/employee/find-all');
    url.searchParams.set('page', '0');
    url.searchParams.set('size', '500');
    url.searchParams.set('showFired', showFired);
    const res = await fetch(url.toString(), { headers: { Authorization: process.env.SOLIDES_API_TOKEN!, Accept: 'application/json' } });
    if (!res.ok) return `Sólides indisponível (HTTP ${res.status})`;
    const data: any = await res.json();
    (data.content || []).filter((e: any) => norm(e.name).includes(fragment))
      .forEach((e: any) => found.push(`${e.id} ${e.name} fired=${e.fired} (lista showFired=${showFired})`));
  }
  return found.join(' | ') || 'não encontrada';
}

async function main() {
  console.log(COMMIT ? '*** MODO COMMIT — vai gravar no Firestore ***\n' : '*** SIMULAÇÃO (use --commit --backup=arquivo.json para gravar) ***\n');
  if (COMMIT && !BACKUP) { console.log('❌ --commit exige --backup=arquivo.json'); process.exit(1); }

  // 1) Pré-condições
  let abort = false;
  const fail = (msg: string) => { console.log(`❌ ${msg}`); abort = true; };

  const leaders = (await db.collection('leaders').get()).docs.map(d => d.data() as any);
  const l13 = leaders.find(l => l.id === MICHAELL.id);
  if (l13?.name !== MICHAELL.name || l13?.slack_id !== MICHAELL.slack_id) fail(`leaders/13 não é o Michaell: ${JSON.stringify(l13)}`);
  const l14 = leaders.find(l => l.id === RAFAELA_LEADER.id);
  if (l14?.name !== RAFAELA_LEADER.name) fail(`leaders/14 não é a Rafaela: ${JSON.stringify(l14)}`);
  const pointing = leaders.filter(l => l.parent_leader_id === 14 || l.cover_leader_id === 14);
  if (pointing.length) fail(`leaders apontam p/ 14: ${pointing.map(l => l.id).join(',')}`);

  const employees = (await db.collection('employees').get()).docs.map(d => d.data() as any);
  const team14 = employees.filter(e => e.leader_id === 14).map(e => e.id).sort();
  if (JSON.stringify(team14) !== JSON.stringify(MOVE.map(m => m.id))) fail(`time 14 mudou: ${team14.join(',')}`);
  const sec14 = employees.filter(e => e.secondary_approver_id === 14 || e.alert_cover_leader_id === 14);
  if (sec14.length) fail(`colaboradores com substituto/alerta no 14: ${sec14.map(e => e.id).join(',')}`);

  const before = new Map<number, any>();
  for (const m of MOVE) {
    const e = (await db.collection('employees').doc(String(m.id)).get()).data();
    if (!e) { fail(`employees/${m.id} não existe`); continue; }
    if (e.name !== m.name) fail(`employees/${m.id} é "${e.name}", esperado "${m.name}"`);
    if (e.leader_id !== 14) fail(`employees/${m.id} não está no leader 14 (está em ${e.leader_id})`);
    if (e.unit_name) fail(`employees/${m.id} já tem unit_name "${e.unit_name}"`);
    before.set(m.id, e);
  }

  const rafaRef = db.collection('employees').doc(String(RAFAELA_EMPLOYEE.id));
  const rafa = (await rafaRef.get()).data();
  if (!rafa) fail(`employees/${RAFAELA_EMPLOYEE.id} não existe`);
  else if (rafa.name !== RAFAELA_EMPLOYEE.name) fail(`employees/${RAFAELA_EMPLOYEE.id} é "${rafa.name}"`);
  const rafaHomonyms = employees.filter(e => norm(e.name).includes('rafaela') && e.id !== RAFAELA_EMPLOYEE.id);

  const [vs, folgas, vacations, leaves, records] = await Promise.all([
    db.collection('vacation_schedules').where('employee_id', '==', RAFAELA_EMPLOYEE.id).get(),
    db.collection('folgas').where('employee_id', '==', RAFAELA_EMPLOYEE.id).get(),
    db.collection('vacations').where('employee_id', '==', RAFAELA_EMPLOYEE.id).get(),
    db.collection('medical_leaves').where('employee_id', '==', RAFAELA_EMPLOYEE.id).get(),
    db.collection('daily_records').where('employee_id', '==', RAFAELA_EMPLOYEE.id).get(),
  ]);

  const pendingAdj = (await db.collection('punch_adjustments').where('status', '==', 'pending').get()).docs
    .map(d => d.data() as any).filter(a => MOVE.some(m => m.id === a.employee_id));
  const pendingJust = (await db.collection('justifications').where('status', '==', 'pending').get()).docs
    .map(d => d.data() as any).filter(j => MOVE.some(m => m.id === j.employee_id));

  if (abort) { console.log('\nPré-condição falhou. Nada foi gravado.'); process.exit(1); }
  console.log('Pré-condições OK. ✓\n');

  // 2) O que vai mudar
  console.log(`Michaell (leader 13) hoje: ${employees.filter(e => e.leader_id === 13).map(e => `${e.id} ${e.name}`).join(' | ')}`);
  console.log(`\nleader_id 14 → 13 e unit_name → '${UNIT_NAME}':`);
  MOVE.forEach(m => {
    const e = before.get(m.id);
    console.log(`  [${m.id}] ${e.name} | slack ${e.slack_id ?? '-'} | sem ponto: ${e.no_punch_required === true ? 'sim' : 'não'}`);
  });
  console.log(`  pendências que passam a aparecer p/ o Michaell: ${pendingAdj.length} ajuste(s) de ponto` +
    `${pendingAdj.length ? ` (${pendingAdj.map(a => `#${a.id}`).join(', ')})` : ''}, ${pendingJust.length} justificativa(s)`);

  console.log(`\nRemover employee ${RAFAELA_EMPLOYEE.id} ${rafa!.name} | leader ${rafa!.leader_id} | slack ${rafa!.slack_id ?? '-'} | solides ${rafa!.solides_employee_id ?? '-'} | sem ponto ${rafa!.no_punch_required === true}`);
  console.log(`  vacation_schedules: ${vs.size} | folgas: ${folgas.size} | vacations: ${vacations.size} | medical_leaves: ${leaves.size} | daily_records: ${records.size} (ficam, exceto vacation_schedules)`);
  vs.docs.forEach(v => console.log(`    vacation_schedule ${v.id}: ${JSON.stringify(v.data())}`));
  console.log(`  Sólides (por nome): ${await solidesByName('rafaela alves mendes')}`);
  console.log(`  outros "rafaela" no cadastro (ficam): ${rafaHomonyms.map(e => `${e.id} ${e.name}`).join(' | ') || 'nenhum'}`);
  console.log(`\nleaders/14 ${l14.name}: mantido p/ histórico (oculto e sem login após o deploy).`);

  if (!COMMIT) { console.log('\nSIMULAÇÃO: nada gravado.'); process.exit(0); }

  // 3) Backup e gravação
  const backupPath = path.resolve(BACKUP!);
  fs.writeFileSync(backupPath, JSON.stringify({
    taken_at: new Date().toISOString(),
    employees: [...before.values(), rafa],
    vacation_schedules: vs.docs.map(d => ({ docId: d.id, ...d.data() })),
  }, null, 2), { flag: 'wx' });
  console.log(`\n✓ backup: ${backupPath}`);

  for (const m of MOVE) {
    await db.collection('employees').doc(String(m.id)).update({ leader_id: MICHAELL.id, unit_name: UNIT_NAME });
    console.log(`✓ employees/${m.id} ${m.name}: leader_id 14 → 13, unit_name '${UNIT_NAME}'`);
  }
  for (const v of vs.docs) {
    await v.ref.delete();
    console.log(`✓ vacation_schedule ${v.id} removido`);
  }
  await rafaRef.delete();
  console.log(`✓ employee ${RAFAELA_EMPLOYEE.id} removido`);

  await db.collection('audit_log').add({
    action: 'ADMIN_BATCH_UPDATE',
    entity_type: 'leader',
    entity_id: MICHAELL.id,
    details: `Rafaela Alves Mendes (leader 14) desligada: Letícia (71) e Millena (72) passam p/ o Michaell (leader 13), ` +
      `card '${UNIT_NAME}'; employee ${RAFAELA_EMPLOYEE.id} e ${vs.size} vencimento(s) de férias removidos. Script apply-rh-michaell-nov2026.`,
    created_at: new Date().toISOString(),
  });
  console.log('✓ auditoria gravada');

  // 4) Ler de volta
  console.log('\n=== Verificação pós-gravação ===');
  for (const m of MOVE) {
    const e = (await db.collection('employees').doc(String(m.id)).get()).data()!;
    console.log(`  [${m.id}] ${e.name} → leader_id ${e.leader_id}, unit_name ${e.unit_name}`);
  }
  console.log(`  employees/${RAFAELA_EMPLOYEE.id} existe? ${(await rafaRef.get()).exists}`);
  const team14After = (await db.collection('employees').where('leader_id', '==', 14).get()).size;
  console.log(`  time 14 restante: ${team14After}`);
  console.log('\nConcluído. O cadastro leva até 30 min p/ refletir no painel.');
  process.exit(0);
}

main().catch(e => { console.error('Erro:', e); process.exit(1); });
