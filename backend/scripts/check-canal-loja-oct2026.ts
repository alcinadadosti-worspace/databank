import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

import * as queries from '../src/models/queries';

// SOMENTE LEITURA — confere líderes e colaboradores do Canal Loja (out/2026)
const db = getFirestore();
const STORE_LEADERS = [6, 10, 11, 12, 18];

async function main() {
  const leaders = (await db.collection('leaders').get()).docs.map(d => ({ docId: d.id, ...d.data() } as any));
  const leaderName = (id: any) => leaders.find(l => l.id === id)?.name ?? `?${id}`;

  console.log('═══ LÍDERES (Canal Loja ou ids 6/10/11/12/18) ═══');
  for (const l of leaders.filter(l => STORE_LEADERS.includes(l.id) || /loja/i.test(l.sector ?? ''))) {
    console.log(`  leader ${l.id} ${l.name} | sector=${l.sector} | slack=${l.slack_id} | parent=${l.parent_leader_id ?? null} | cover_leader_id=${l.cover_leader_id ?? null}`);
  }

  const emps = (await db.collection('employees').get()).docs.map(d => ({ docId: d.id, ...d.data() } as any));
  console.log('\n═══ COLABORADORES dos líderes 6/10/11/12/18 (ou com alert_cover / secondary approver de loja) ═══');
  const rel = emps.filter(e => STORE_LEADERS.includes(e.leader_id)
    || e.alert_cover_leader_id != null
    || STORE_LEADERS.includes(e.secondary_approver_id));
  rel.sort((a, b) => (a.leader_id - b.leader_id) || a.name.localeCompare(b.name));
  for (const e of rel) {
    console.log(`  [${e.id}] ${e.name} | leader=${e.leader_id} (${leaderName(e.leader_id)}) | alert_cover=${e.alert_cover_leader_id ?? null} | sec=${e.secondary_approver_id ?? null} | no_punch=${e.no_punch_required === true} | slack=${e.slack_id ?? null} | active=${e.active ?? '-'}`);
  }

  console.log('\n═══ ROTEAMENTO EFETIVO DE ALERTAS (getAllEmployees) ═══');
  const all = await queries.getAllEmployees();
  const slackToLeader = new Map(leaders.map(l => [l.slack_id, `${l.id} ${l.name}`]));
  for (const e of all.filter(e => STORE_LEADERS.includes(e.leader_id)).sort((a, b) => a.leader_id - b.leader_id || a.name.localeCompare(b.name))) {
    console.log(`  [${e.id}] ${e.name} → alertas p/ ${slackToLeader.get((e as any).leader_slack_id) ?? (e as any).leader_slack_id}`);
  }

  const date = process.argv[2] || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  console.log(`\n═══ CARDS DA ABA UNIDADES (${date}) ═══`);
  const units = await queries.getUnitRecords(date);
  const placed = new Set<number>();
  for (const u of units.filter(u => /loja|sem ponto/i.test(u.unit_name))) {
    console.log(`  ${u.unit_name} (leader ${u.leader_id} ${u.leader_name}):`);
    for (const e of u.employees) {
      placed.add(e.id);
      console.log(`     [${e.id}] ${e.name}${e.no_punch_required ? ' (sem ponto)' : ''}`);
    }
  }
  for (const u of units) for (const e of u.employees) placed.add(e.id);
  const orphans = all.filter(e => STORE_LEADERS.includes(e.leader_id) && !placed.has(e.id));
  console.log('\n  colaboradores de loja que NÃO aparecem em nenhum card:', orphans.length ? '' : 'nenhum');
  for (const e of orphans) console.log(`     [${e.id}] ${e.name} leader=${e.leader_id}`);

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
