import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}
// SOMENTE LEITURA — avisos/ajustes ligados aos daily_records de Coruripe desde START.
const db = getFirestore();
const IDS = [112, 113, 124, 63, 62];
const START = process.argv[2] || '2026-11-03';
(async () => {
  const sample = await db.collection('audit_log').orderBy('created_at', 'desc').limit(3).get();
  sample.docs.forEach(d => { const v = d.data() as any; console.log(`amostra audit: created_at=${JSON.stringify(v.created_at)} action=${v.action}`); });
  for (const id of IDS) {
    const recs = await db.collection('daily_records').where('employee_id', '==', id).get();
    for (const r of recs.docs.filter(d => String(d.data().date) >= START).sort((a, b) => String(a.data().date).localeCompare(String(b.data().date)))) {
      const logs = await db.collection('audit_log').where('entity_id', '==', String(r.data().id)).get();
      const logs2 = await db.collection('audit_log').where('entity_id', '==', Number(r.data().id)).get();
      const all = [...logs.docs, ...logs2.docs].map(x => x.data() as any).filter(l => l.entity_type === 'daily_record');
      const adj = await db.collection('punch_adjustments').where('daily_record_id', '==', String(r.data().id)).get();
      const adj2 = await db.collection('punch_adjustments').where('daily_record_id', '==', Number(r.data().id)).get();
      const adjs = [...adj.docs, ...adj2.docs].map(x => x.data() as any);
      if (all.length === 0 && adjs.length === 0) continue;
      console.log(`emp ${id} ${r.data().date} (rec ${r.data().id}) app: ${r.data().punch_1 ?? '--'} ${r.data().punch_2 ?? '--'} ${r.data().punch_3 ?? '--'} ${r.data().punch_4 ?? '--'} ${r.data().classification}`);
      all.sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).forEach(l => console.log(`   ${l.created_at} ${l.action} ${String(l.details ?? '').slice(0, 140)}`));
      adjs.forEach(a => console.log(`   ajuste #${a.id}: status=${a.status} tipo=${a.type} faltando=${JSON.stringify(a.missing_punches)} enviado=${a.submitted_at} decidido=${a.reviewed_at ?? a.approved_at ?? "-"} motivo="${String(a.reason ?? '').slice(0, 80)}"`));
    }
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
