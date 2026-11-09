/**
 * SOMENTE LEITURA. Compara o audit_log antes e depois de um push, para ver se houve sync fora do
 * ciclo de 5 min (sinal de reinicio do backend) ou volume anormal de notificacoes do Slack.
 *
 * Uso: npx tsx scripts/check-audit-after-push-nov2026.ts --push=2026-11-06T14:36:13Z --since=2026-11-06T13:45:00Z
 */
import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'path';
import fs from 'fs';

if (getApps().length === 0) {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (b64) {
    initializeApp({ credential: cert(JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))) });
  } else {
    initializeApp({ credential: cert(JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'firebase-key.json'), 'utf8'))) });
  }
}
const db = getFirestore();
const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))!.split('=')[1];

async function main() {
  const push = new Date(arg('push')).toISOString();
  const since = new Date(arg('since')).toISOString();
  const snap = await db.collection('audit_log').where('created_at', '>=', since).orderBy('created_at', 'asc').get();
  const rows = snap.docs.map(d => d.data() as any);

  const count = (list: any[]) => {
    const m = new Map<string, number>();
    list.forEach(x => m.set(x.action, (m.get(x.action) || 0) + 1));
    return [...m.entries()].sort().map(([a, n]) => `${a}=${n}`).join(' ') || '(nada)';
  };
  const before = rows.filter(x => x.created_at < push);
  const after = rows.filter(x => x.created_at >= push);
  const minutes = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / 60000);
  console.log(`antes do push (${minutes(since, push)} min): ${count(before)}`);
  console.log(`depois do push (${minutes(push, new Date().toISOString())} min): ${count(after)}`);

  const syncs = rows.filter(x => x.action === 'SYNC_COMPLETED').map(x => x.created_at as string);
  console.log(`\nSYNC_COMPLETED (${syncs.length}):`);
  console.log(syncs.map(s => s.slice(11, 19) + (s >= push ? '*' : '')).join(' '));

  // Intervalo entre syncs: no ciclo normal fica perto de 5 min; reinicio gera um intervalo curto
  const gaps = syncs.slice(1).map((s, i) => ({ at: s, gap: (new Date(s).getTime() - new Date(syncs[i]).getTime()) / 60000 }));
  const odd = gaps.filter(g => g.gap < 3);
  console.log(`intervalos < 3 min: ${odd.length ? odd.map(g => `${g.at.slice(11, 19)} (${g.gap.toFixed(1)} min)`).join(', ') : 'nenhum'}`);

  const slackAfter = after.filter(x => String(x.action).startsWith('SLACK_') || x.action === 'MANAGER_DAILY_SUMMARIES_SENT');
  console.log(`\nnotificacoes depois do push (${slackAfter.length}):`);
  slackAfter.slice(0, 30).forEach(x => console.log(`  ${String(x.created_at).slice(11, 19)} ${x.action} ${String(x.details).slice(0, 90)}`));

  console.log(`\ntudo depois do push, exceto API_READ:`);
  after.filter(x => x.action !== 'API_READ').forEach(x => console.log(`  ${String(x.created_at).slice(11, 19)} ${x.action} ${x.entity_type ?? ''}:${x.entity_id ?? ''} ${String(x.details).slice(0, 110)}`));
  console.log(`API_READ depois do push:`);
  after.filter(x => x.action === 'API_READ').forEach(x => console.log(`  ${String(x.created_at).slice(11, 19)} ${String(x.details).slice(0, 80)}`));

  // Historico: syncs fora do ciclo de 5 min (segundos apos o multiplo de 5 > 60)
  const days = 14;
  const from = new Date(Date.now() - days * 86400000).toISOString();
  const hist = (await db.collection('audit_log').where('created_at', '>=', from).orderBy('created_at', 'asc').get()).docs.map(d => d.data() as any);
  const allSyncs = hist.filter(x => x.action === 'SYNC_COMPLETED');
  const offCycle = allSyncs.filter(x => {
    const d = new Date(x.created_at);
    return (d.getUTCMinutes() % 5) * 60 + d.getUTCSeconds() > 60;
  });
  console.log(`\nultimos ${days} dias: ${allSyncs.length} SYNC_COMPLETED, ${offCycle.length} fora do ciclo:`);
  offCycle.forEach(x => console.log(`  ${String(x.created_at).slice(0, 19)}Z ${String(x.details).slice(0, 70)}`));

  const alertas = hist.filter(x => x.action === 'SLACK_EMPLOYEE_ALERT');
  const hoje = new Date().toISOString().slice(0, 10);
  console.log(`\nSLACK_EMPLOYEE_ALERT hoje: ${alertas.filter(x => String(x.created_at).startsWith(hoje)).length} | ultimos ${days} dias: ${alertas.length}`);
  process.exit(0);
}

main().catch(e => { console.error('Erro:', e); process.exit(1); });
