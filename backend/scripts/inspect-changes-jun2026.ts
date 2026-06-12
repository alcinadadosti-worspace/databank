import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const TO_REMOVE = [
  'thamirys silvestrini morales',
  'larissa alexia da silva souza',
  'maria victoria souza araujo ferro',
  'michaell jean nunes de carvalho',
];

async function main() {
  console.log('═══ LÍDERES ═══');
  const leadersSnap = await db.collection('leaders').get();
  const leaders = leadersSnap.docs.map(d => d.data());
  leaders.sort((a, b) => a.id - b.id);
  for (const l of leaders) {
    console.log(`  [${l.id}] ${l.name} | sector: ${l.sector ?? '-'} | slack: ${l.slack_id ?? '-'} | cover: ${l.cover_leader_id ?? '-'} | parent: ${l.parent_leader_id ?? '-'}`);
  }

  console.log('\n═══ PESSOAS A REMOVER (employees) ═══');
  const empSnap = await db.collection('employees').get();
  const employees = empSnap.docs.map(d => ({ docId: d.id, ...d.data() } as any));
  for (const target of TO_REMOVE) {
    const matches = employees.filter(e => {
      const n = norm(e.name || '');
      return target.split(' ').every(part => n.includes(part));
    });
    if (matches.length === 0) {
      console.log(`  "${target}": NÃO ENCONTRADO em employees`);
    } else {
      matches.forEach(e => console.log(`  "${target}" → [doc ${e.docId}] id=${e.id} ${e.name} | leader_id=${e.leader_id} | slack=${e.slack_id ?? '-'} | solides=${e.solides_employee_id ?? '-'}`));
    }
  }

  console.log('\n═══ MICHAELL COMO LÍDER ═══');
  const michaellLeader = leaders.filter(l => norm(l.name || '').includes('michaell'));
  if (michaellLeader.length === 0) {
    console.log('  Michaell NÃO encontrado em leaders');
  }
  for (const ml of michaellLeader) {
    console.log(`  Líder [${ml.id}] ${JSON.stringify(ml)}`);
    const team = employees.filter(e => e.leader_id === ml.id);
    console.log(`  Time dele (${team.length} colaboradores):`);
    team.forEach(e => console.log(`    id=${e.id} ${e.name}`));
    const secondaries = employees.filter(e => e.secondary_approver_id === ml.id);
    if (secondaries.length) {
      console.log(`  Aprovador secundário de (${secondaries.length}):`);
      secondaries.forEach(e => console.log(`    id=${e.id} ${e.name}`));
    }
    const covering = leaders.filter(l => l.cover_leader_id === ml.id);
    if (covering.length) {
      console.log(`  É cover de: ${covering.map(l => l.name).join(', ')}`);
    }
  }

  console.log('\n═══ USERS (logins web) ═══');
  const usersSnap = await db.collection('users').get();
  usersSnap.docs.forEach(d => {
    const u = d.data();
    console.log(`  [doc ${d.id}] username=${u.username ?? '-'} | role=${u.role ?? '-'} | leader_id=${u.leader_id ?? '-'} | name=${u.name ?? '-'}`);
  });

  console.log('\n═══ NOVOS — já existem? ═══');
  for (const target of ['sione barbosa da silva', 'samuel monteiro', 'tomas azevedo santos']) {
    const matches = employees.filter(e => {
      const n = norm(e.name || '');
      return target.split(' ').every(part => n.includes(part));
    });
    console.log(`  "${target}": ${matches.length === 0 ? 'não existe em employees' : matches.map(e => `JÁ EXISTE id=${e.id} ${e.name}`).join('; ')}`);
  }

  console.log('\n═══ MAIOR ID de employee ═══');
  const maxId = Math.max(...employees.map(e => Number(e.id) || 0));
  console.log(`  max id = ${maxId}`);

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
