/** READ-ONLY: valida as otimizacoes de leitura contra dados reais.
 *  1. getEmployeesOnVacation: query nova (end_date >=) == query antiga (start_date <=)
 *  2. getUnitRecords: 2a chamada vem do cache (mesma referencia) e resultado coerente
 *  3. getReviewedJustifications/Adjustments: cache retorna o mesmo conteudo
 */
import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

import * as queries from '../src/models/queries';

const db = getFirestore();

async function oldVacationQuery(checkDate: string): Promise<Set<number>> {
  const snap = await db.collection('vacations').where('start_date', '<=', checkDate).get();
  const vacations = snap.docs.map(d => d.data() as any).filter(v => v.end_date >= checkDate);
  return new Set(vacations.map(v => v.employee_id));
}

function setsEqual(a: Set<number>, b: Set<number>): boolean {
  return a.size === b.size && [...a].every(x => b.has(x));
}

async function main() {
  let ok = true;

  // 1. Vacation query equivalence for several dates
  for (const d of ['2026-08-18', '2026-08-10', '2026-07-01', '2026-08-25']) {
    const oldSet = await oldVacationQuery(d);
    const newSet = await queries.getEmployeesOnVacation(d);
    const equal = setsEqual(oldSet, newSet);
    if (!equal) ok = false;
    console.log(`vacation ${d}: old=${oldSet.size} new=${newSet.size} -> ${equal ? 'OK' : 'DIVERGIU!'}`);
  }

  // 2. getUnitRecords cache behavior + totals coherent
  const t0 = Date.now();
  const first = await queries.getUnitRecords('2026-08-17');
  const t1 = Date.now();
  const second = await queries.getUnitRecords('2026-08-17');
  const t2 = Date.now();
  const sameRef = first === second;
  const totals = first.map(u => `${u.unit_name}:${u.present_count}/${u.total_count}`).join(' | ');
  console.log(`\nunits 17/08: 1a chamada ${t1 - t0}ms, 2a ${t2 - t1}ms, cache=${sameRef ? 'OK' : 'FALHOU'}`);
  console.log(`  ${totals}`);
  if (!sameRef) ok = false;

  // 3. Reviewed lists cache
  const j1 = await queries.getReviewedJustifications() as any[];
  const j2 = await queries.getReviewedJustifications() as any[];
  console.log(`\njustificativas revisadas: ${j1.length} itens, cache=${j1 === j2 ? 'OK' : 'FALHOU'}`);
  if (j1 !== j2) ok = false;

  const a1 = await queries.getReviewedPunchAdjustments();
  const a2 = await queries.getReviewedPunchAdjustments();
  const withDate = a1.filter(a => a.date).length;
  console.log(`ajustes revisados: ${a1.length} itens (${withDate} com data), cache=${a1 === a2 ? 'OK' : 'FALHOU'}`);
  if (a1 !== a2) ok = false;

  const n1 = await queries.getNoRecordDecisionsRange('2026-08-10', '2026-08-17');
  const n2 = await queries.getNoRecordDecisionsRange('2026-08-10', '2026-08-17');
  console.log(`ausencias 10-17/08: ${n1.length} itens, cache=${n1 === n2 ? 'OK' : 'FALHOU'}`);
  if (n1 !== n2) ok = false;

  console.log(ok ? '\nTUDO OK' : '\nHOUVE DIVERGENCIA — revisar antes de deploy!');
  process.exit(ok ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
