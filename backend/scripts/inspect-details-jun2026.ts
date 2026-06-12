import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

async function main() {
  console.log('═══ EMPLOYEES 65 (Tomás), 85 (Michaell) — docs completos ═══');
  for (const id of ['65', '85']) {
    const doc = await db.collection('employees').doc(id).get();
    console.log(`  [${id}] ${JSON.stringify(doc.data())}`);
  }

  console.log('\n═══ USERS 48 (M.Victoria), 65 (Thamirys), 67 (Tomás), 78 (Michaell) ═══');
  for (const id of ['48', '65', '67', '78']) {
    const doc = await db.collection('users').doc(id).get();
    console.log(`  [${id}] ${JSON.stringify(doc.data())}`);
  }

  console.log('\n═══ USERS com slack da Larissa (U0ALX1EJUC8) ═══');
  const larissaUser = await db.collection('users').where('slack_id', '==', 'U0ALX1EJUC8').get();
  console.log(`  ${larissaUser.docs.length} docs: ${larissaUser.docs.map(d => `[${d.id}] ${JSON.stringify(d.data())}`).join('\n  ')}`);

  console.log('\n═══ Slack API: busca por nome (users.list) ═══');
  const token = process.env.SLACK_BOT_TOKEN;
  if (token && token.startsWith('xoxb-')) {
    let cursor: string | undefined;
    const targets = ['sione', 'samuel'];
    const found: string[] = [];
    do {
      const url = new URL('https://slack.com/api/users.list');
      url.searchParams.set('limit', '200');
      if (cursor) url.searchParams.set('cursor', cursor);
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      const data: any = await res.json();
      if (!data.ok) { console.log(`  Erro Slack: ${data.error}`); break; }
      for (const m of data.members || []) {
        const names = [m.real_name, m.profile?.real_name, m.profile?.display_name, m.name].filter(Boolean).join(' | ').toLowerCase();
        if (targets.some(t => names.includes(t))) {
          found.push(`  ${m.id}: real_name="${m.real_name}" display="${m.profile?.display_name}" deleted=${m.deleted}`);
        }
      }
      cursor = data.response_metadata?.next_cursor || undefined;
    } while (cursor);
    console.log(found.length ? found.join('\n') : '  Nenhum match para sione/samuel');
  } else {
    console.log('  SLACK_BOT_TOKEN não configurado localmente');
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
