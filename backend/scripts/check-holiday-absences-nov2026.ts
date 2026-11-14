/**
 * Somente leitura: lista os feriados cadastrados no painel (com destaque para os
 * municipais com lista de colaboradores) e quem, em cada um, aparecia como
 * ausente na aba Ausências do gestor (sem batida, sem férias/folga/atestado).
 */
import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

async function main() {
  const holidays = (await db.collection('holidays').get()).docs.map(d => d.data() as any);
  holidays.sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const emps = new Map((await db.collection('employees').get()).docs.map(d => [Number(d.id), d.data() as any]));

  console.log(`Feriados cadastrados: ${holidays.length}`);
  const byMonthDay = new Map<string, any[]>();
  for (const h of holidays) {
    const key = h.recurring ? `*-${String(h.date).slice(5)}` : h.date;
    const ids: number[] = h.employee_ids ?? [];
    console.log(`  #${h.id} ${h.date} ${h.recurring ? '(recorrente)' : ''} [${h.type}] ${h.name}${ids.length ? ` — ${ids.length} colaborador(es)` : ''}`);
    const md = String(h.date).slice(5);
    if (!byMonthDay.has(md)) byMonthDay.set(md, []);
    byMonthDay.get(md)!.push(h);
  }

  console.log('\nDatas (mês-dia) com mais de um feriado cadastrado:');
  for (const [md, list] of byMonthDay) {
    if (list.length > 1) console.log(`  ${md}: ${list.map(h => `#${h.id} ${h.date} [${h.type}] ${h.name}`).join(' | ')}`);
  }

  const partial = holidays.filter(h => h.type === 'municipal' && (h.employee_ids ?? []).length > 0);
  console.log(`\nMunicipais com lista de colaboradores: ${partial.length}`);
  for (const h of partial) {
    const date = h.recurring ? `2026-${String(h.date).slice(5)}` : h.date;
    const recs = new Map((await db.collection('daily_records').where('date', '==', date).get()).docs
      .map(d => [d.data().employee_id as number, d.data() as any]));
    const vac = (await db.collection('vacations').where('end_date', '>=', date).get()).docs
      .map(d => d.data() as any).filter(v => v.start_date <= date).map(v => v.employee_id);
    const folgas = new Map((await db.collection('folgas').where('date', '==', date).get()).docs
      .map(d => [d.data().employee_id as number, d.data().type as string]));
    console.log(`\n  #${h.id} ${date} ${h.name}:`);
    for (const id of h.employee_ids as number[]) {
      const e = emps.get(id);
      const r = recs.get(id);
      const covered = vac.includes(id) ? 'férias' : folgas.get(id) === 'integral' ? 'folga integral' : null;
      const status = e?.no_punch_required ? 'sem ponto' : r?.punch_1 ? `bateu ${r.punch_1}` : covered ?? 'APARECIA COMO AUSENTE';
      console.log(`    ${id} ${e?.name ?? '(não cadastrado)'} (leader ${e?.leader_id ?? '-'}) → ${status} | classificação: ${r?.classification ?? '-'}`);
    }
  }
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
