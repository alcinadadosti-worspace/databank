import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();
const TOKEN = process.env.SOLIDES_API_TOKEN!;

// SOMENTE LEITURA — levantamento para cadastrar João Paulo Vieira Melo (time da Suzana).
function norm(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

async function main() {
  // 1) Sólides — registro completo
  const url = new URL('https://employer.tangerino.com.br/employee/find-all');
  url.searchParams.set('page', '0');
  url.searchParams.set('size', '500');
  url.searchParams.set('showFired', 'false');
  const res = await fetch(url.toString(), { headers: { Authorization: TOKEN, Accept: 'application/json' } });
  const data: any = await res.json();
  const hits = (data.content || []).filter((e: any) => norm(e.name).includes('joao paulo'));
  console.log('═══ SÓLIDES ═══');
  hits.forEach((h: any) => console.log(JSON.stringify(h, null, 2)));

  // 2) Firestore — colisões e max id
  const snap = await db.collection('employees').get();
  let max = 0;
  const collisions: string[] = [];
  snap.docs.forEach(d => {
    const e = d.data();
    if (typeof e.id === 'number' && e.id > max) max = e.id;
    const n = norm(e.name || '');
    if (n.includes('joao paulo') || n.includes('vieira melo')) collisions.push(`[${d.id}] ${JSON.stringify(e)}`);
    if (hits.some((h: any) => String(h.id) === String(e.solides_employee_id))) {
      collisions.push(`[${d.id}] MESMO solides_employee_id: ${JSON.stringify(e)}`);
    }
  });
  console.log('\n═══ FIRESTORE ═══');
  console.log('Total employees:', snap.size, '| Max id:', max);
  console.log('Counter:', JSON.stringify((await db.collection('counters').doc('employees').get()).data()));
  console.log('Possíveis colisões:', collisions.length ? '\n  ' + collisions.join('\n  ') : 'nenhuma ✓');

  // 3) Líderes
  console.log('\n═══ LEADERS ═══');
  (await db.collection('leaders').get()).docs.forEach(d => console.log(`  ${JSON.stringify(d.data())}`));

  // 4) Time atual da Suzana (leader 15)
  console.log('\n═══ TIME leader_id=15 ═══');
  snap.docs.map(d => d.data()).filter(e => e.leader_id === 15).forEach(e =>
    console.log(`  [${e.id}] ${e.name} | exp=${e.expected_daily_minutes} sat=${e.works_saturday} noPunch=${e.no_punch_required} solides=${e.solides_employee_id}`));

  // 5) Slack — procurar o usuário
  console.log('\n═══ SLACK ═══');
  const token = process.env.SLACK_BOT_TOKEN;
  if (token && token.startsWith('xoxb-')) {
    let cursor: string | undefined;
    const found: string[] = [];
    do {
      const u = new URL('https://slack.com/api/users.list');
      u.searchParams.set('limit', '200');
      if (cursor) u.searchParams.set('cursor', cursor);
      const r = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}` } });
      const d: any = await r.json();
      if (!d.ok) { console.log('  Erro Slack:', d.error); break; }
      for (const m of d.members || []) {
        const names = norm([m.real_name, m.profile?.real_name, m.profile?.display_name, m.name].filter(Boolean).join(' | '));
        if (names.includes('joao paulo') || names.includes('vieira melo') || names.includes('joao') && names.includes('melo')) {
          found.push(`  ${m.id}: real_name="${m.real_name}" display="${m.profile?.display_name}" email="${m.profile?.email}" deleted=${m.deleted} bot=${m.is_bot}`);
        }
      }
      cursor = d.response_metadata?.next_cursor || undefined;
    } while (cursor);
    console.log(found.length ? found.join('\n') : '  Nenhum match');
  } else {
    console.log('  SLACK_BOT_TOKEN não configurado');
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
