/**
 * SOMENTE LEITURA. Levanta o estado do RH antes da troca Rafaela → Michaell (nov/2026):
 * leaders, time da Rafaela, quem aponta para ela (secondary/cover/parent), cadastro dela
 * como colaboradora e o estado atual do Michaell (leader 13 / employee 127).
 *
 * Uso: npx tsx scripts/inspect-rh-rafaela-nov2026.ts
 */
import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

const norm = (s: any) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function main() {
  const leaders = (await db.collection('leaders').get()).docs.map(d => ({ docId: d.id, ...d.data() } as any));
  const employees = (await db.collection('employees').get()).docs.map(d => ({ docId: d.id, ...d.data() } as any));

  console.log('=== leaders ===');
  leaders.sort((a, b) => a.id - b.id).forEach(l => console.log(
    `  ${l.id} ${l.name} | sector=${l.sector ?? '-'} | slack=${l.slack_id ?? '-'}` +
    `${l.parent_leader_id ? ` | parent=${l.parent_leader_id}` : ''}${l.cover_leader_id ? ` | cover=${l.cover_leader_id}` : ''}` +
    `${l.docId !== String(l.id) ? ` | docId=${l.docId}` : ''}`));

  const rafaLeaders = leaders.filter(l => norm(l.name).includes('rafaela'));
  console.log(`\nleaders com "rafaela": ${rafaLeaders.map(l => `${l.id} ${l.name}`).join(' | ') || 'nenhum'}`);

  for (const rl of rafaLeaders) {
    const team = employees.filter(e => e.leader_id === rl.id);
    console.log(`\n=== time do leader ${rl.id} (${rl.name}): ${team.length} ===`);
    team.sort((a, b) => a.id - b.id).forEach(e => console.log(
      `  ${e.id} ${e.name} | slack=${e.slack_id ?? '-'} | solides=${e.solides_employee_id ?? '-'} | sem_ponto=${e.no_punch_required === true}` +
      ` | unit_name=${e.unit_name ?? '-'} | secondary=${e.secondary_approver_id ?? '-'}`));
    const sec = employees.filter(e => e.secondary_approver_id === rl.id);
    console.log(`secondary_approver_id=${rl.id}: ${sec.map(e => `${e.id} ${e.name} (leader ${e.leader_id})`).join(' | ') || 'nenhum'}`);
    const pointers = leaders.filter(l => l.parent_leader_id === rl.id || l.cover_leader_id === rl.id);
    console.log(`leaders que apontam p/ ${rl.id} (parent/cover): ${pointers.map(l => `${l.id} ${l.name}`).join(' | ') || 'nenhum'}`);
  }

  const rafaEmps = employees.filter(e => norm(e.name).includes('rafaela'));
  console.log(`\n=== employees com "rafaela" ===`);
  rafaEmps.forEach(e => console.log(`  ${e.id} ${e.name} | leader=${e.leader_id} | slack=${e.slack_id ?? '-'} | solides=${e.solides_employee_id ?? '-'} | sem_ponto=${e.no_punch_required === true}`));

  const michLeader = leaders.find(l => l.id === 13);
  console.log(`\n=== Michaell ===`);
  console.log(`  leaders/13: ${JSON.stringify(michLeader)}`);
  employees.filter(e => norm(e.name).includes('michael')).forEach(e => console.log(`  employee ${JSON.stringify(e)}`));
  const team13 = employees.filter(e => e.leader_id === 13);
  console.log(`  time 13: ${team13.map(e => `${e.id} ${e.name}`).join(' | ')}`);
  const team17 = employees.filter(e => e.leader_id === 17);
  console.log(`  time 17: ${team17.map(e => `${e.id} ${e.name}`).join(' | ')}`);

  // users (identificação pelo Slack) da Rafaela
  for (const rl of rafaLeaders) {
    if (!rl.slack_id) continue;
    const u = await db.collection('users').where('slack_id', '==', rl.slack_id).get();
    console.log(`\nusers com slack ${rl.slack_id}: ${u.docs.map(d => `${d.id}:${JSON.stringify(d.data())}`).join(' | ') || 'nenhum'}`);
  }

  // Pendências abertas que dependem do gestor (ajustes de ponto / justificativas)
  for (const rl of rafaLeaders) {
    const teamIds = new Set(employees.filter(e => e.leader_id === rl.id).map(e => e.id));
    for (const col of ['punch_adjustments', 'justifications']) {
      const snap = await db.collection(col).where('status', '==', 'pending').get();
      const mine = snap.docs.map(d => d.data() as any).filter(x => teamIds.has(x.employee_id));
      console.log(`${col} pendentes do time ${rl.id}: ${mine.length}${mine.length ? ' → ' + mine.map(x => `${x.id}(emp ${x.employee_id}, ${x.date ?? x.daily_record_id})`).join(', ') : ''}`);
    }
  }
  process.exit(0);
}

main().catch(e => { console.error('Erro:', e); process.exit(1); });
