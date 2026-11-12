import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}
import { resolveUnitName } from '../src/models/queries';

// SOMENTE LEITURA — Loja Coruripe: "bati o ponto mas o app mostra que não".
// Compara Sólides (qualquer status, plataforma, aparelho, atraso de chegada) x daily_records.
// Chama a API da Sólides direto (sem fetchPunches) para não gravar API_READ no audit_logs.
// Não imprime dados pessoais (e-mail, PIN, foto, localização).
const db = getFirestore();
const TOKEN = process.env.SOLIDES_API_TOKEN!;
const UNIT = process.argv[4] || 'Loja Coruripe';
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
const START = process.argv[2] || '2026-11-03';
const END = process.argv[3] || today;

function ms(d: string, end = false) { const [y, m, dd] = d.split('-').map(Number); const x = new Date(Date.UTC(y, m - 1, dd, end ? 23 : 0, end ? 59 : 0, end ? 59 : 0)); return String(x.getTime() + 3 * 3600e3); }
const brt = (t: number | null | undefined) => t ? new Date(t - 3 * 3600e3).toISOString().slice(11, 16) : '--:--';
const brtFull = (t: number | null | undefined) => t ? new Date(t - 3 * 3600e3).toISOString().slice(5, 16).replace('T', ' ') : '--';

async function fetchPunchesRaw(emp: string, status?: string): Promise<any[]> {
  const out: any[] = [];
  let page = 0, totalPages = 1;
  while (page < totalPages) {
    const u = new URL('https://apis.tangerino.com.br/punch/');
    u.searchParams.set('startDate', ms(START)); u.searchParams.set('endDate', ms(END, true));
    u.searchParams.set('page', String(page)); u.searchParams.set('size', '500'); u.searchParams.set('employeeId', emp);
    if (status) u.searchParams.set('status', status);
    const res = await fetch(u.toString(), { headers: { Authorization: TOKEN, Accept: 'application/json' } });
    if (!res.ok) { console.log(`    ⚠ Sólides ${res.status} (${status ?? 'sem status'}): ${(await res.text()).slice(0, 160)}`); return out; }
    const data = await res.json() as any;
    totalPages = data.totalPages || 1;
    out.push(...(data.content || []));
    page++;
  }
  return out;
}

(async () => {
  console.log(`Período ${START} a ${END} | unidade ${UNIT}\n`);

  // 1) Saúde do sync (empresa toda)
  const logs = await db.collection('audit_log').where('created_at', '>=', START).get();
  const counts = new Map<string, number>();
  const errors: string[] = [];
  let lastSync = '';
  for (const d of logs.docs.map(x => x.data() as any)) {
    if (!/SYNC|STALE|CHECK_SKIPPED/.test(d.action)) continue;
    counts.set(d.action, (counts.get(d.action) ?? 0) + 1);
    if (d.action === 'SYNC_ERROR' || d.action === 'CHECK_SKIPPED_STALE_DATA') errors.push(`${d.created_at} ${d.action} ${String(d.details ?? '').slice(0, 200)}`);
    if (d.action === 'SYNC_COMPLETED' && String(d.created_at) > lastSync) lastSync = String(d.created_at);
  }
  console.log('Sync (audit_log):', [...counts.entries()].map(([k, v]) => `${k}=${v}`).join(' '));
  console.log(`Último SYNC_COMPLETED: ${lastSync || '-'}`);
  errors.sort().slice(-15).forEach(e => console.log(`  ${e}`));

  // 2) Quem é da unidade
  const empSnap = await db.collection('employees').get();
  const all = empSnap.docs.map(d => ({ id: Number(d.id), ...(d.data() as any) }));
  const team = all.filter(e => resolveUnitName(e) === UNIT);
  console.log(`\n${UNIT}: ${team.length} pessoas`);
  for (const e of team) console.log(`  ${e.id} ${e.name} | leader ${e.leader_id} | solides ${e.solides_employee_id ?? '-'} | no_punch ${e.no_punch_required ?? false} | ativo ${e.active ?? '-'}`);

  // 3) Por pessoa: Sólides x daily_records
  for (const e of team) {
    console.log(`\n=== ${e.id} ${e.name} (Sólides ${e.solides_employee_id ?? '-'}) ===`);
    if (!e.solides_employee_id) { console.log('  ⚠ sem solides_employee_id — sync casa só por nome'); }
    const byId = new Map<string, any>();
    if (e.solides_employee_id) {
      for (const st of [undefined, 'APPROVED', 'PENDING']) for (const p of await fetchPunchesRaw(String(e.solides_employee_id), st)) byId.set(String(p.id), p);
    }
    const punches = [...byId.values()].sort((a, b) => a.dateIn - b.dateIn);
    const recSnap = await db.collection('daily_records').where('employee_id', '==', e.id).get();
    const recs = new Map(recSnap.docs.map(d => d.data() as any).filter(r => r.date >= START && r.date <= END).map(r => [r.date, r]));
    const dates = [...new Set([...punches.map(p => p.date), ...recs.keys()])].sort();
    if (dates.length === 0) console.log('  (nada na Sólides nem no app no período)');
    for (const date of dates) {
      const ps = punches.filter(p => p.date === date);
      const r = recs.get(date);
      const solidesStr = ps.map(p => {
        const delayH = p.lastModifiedDate ? ((p.lastModifiedDate - (p.dateOut ?? p.dateIn)) / 3600e3).toFixed(1) : '?';
        return `${brt(p.dateIn)}-${brt(p.dateOut)} [${p.status} ${p.plataform ?? '?'} ap ${p.devicedId ?? '-'} chegou ${brtFull(p.lastModifiedDate)} +${delayH}h]`;
      }).join(' ; ') || '(nada)';
      const appStr = r ? `${r.punch_1 ?? '--'} ${r.punch_2 ?? '--'} ${r.punch_3 ?? '--'} ${r.punch_4 ?? '--'} | ${r.classification ?? 'pendente'} | manual ${JSON.stringify(r.manual_punches ?? [])} | upd ${r.updated_at ?? '-'}` : '(sem daily_record)';
      console.log(`  ${date}\n    Sólides: ${solidesStr}\n    App:     ${appStr}`);
    }
  }
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
