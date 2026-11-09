/**
 * SOMENTE LEITURA. Compara a regra antiga e a nova do status da aba Vencimentos (admin/ferias)
 * sobre os dados atuais do Firestore. Espelha isPeriodCovered de frontend/src/app/admin/ferias/page.tsx.
 *
 * Uso: npx tsx scripts/check-ferias-concluido-nov2026.ts [--dump=arquivo.json]
 *      --dump grava schedules/vacations como a API devolve, para testar a tela sem backend.
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

const oldCovered = (s: any, vacs: any[]) => (d: string) => vacs.some(v => v.start_date <= d);
const newCovered = (s: any, vacs: any[]) => {
  if ((s.days_taken ?? 0) > 0 && (s.days_remaining ?? 0) > 0) return false;
  return vacs.some(v => v.start_date > s.period_1_date && (!s.period_2_date || v.start_date <= s.period_2_date));
};

function bucket(nearest: string, today: string) {
  const diff = Math.ceil((new Date(nearest + 'T12:00:00').getTime() - new Date(today + 'T12:00:00').getTime()) / 86400000);
  return diff < 0 ? 'vencido' : diff <= 30 ? 'proximo' : 'ok';
}

async function main() {
  const employees = (await db.collection('employees').get()).docs.map(d => d.data() as any);
  const empById = new Map(employees.map(e => [e.id, e]));
  const schedules = (await db.collection('vacation_schedules').get()).docs.map(d => d.data() as any);
  const vacations = (await db.collection('vacations').get()).docs.map(d => d.data() as any);
  const vacsByEmp = new Map<number, any[]>();
  vacations.forEach(v => { if (!vacsByEmp.has(v.employee_id)) vacsByEmp.set(v.employee_id, []); vacsByEmp.get(v.employee_id)!.push(v); });
  const today = new Date().toISOString().split('T')[0];

  const oldCount: Record<string, number> = { vencido: 0, proximo: 0, ok: 0, foraDoContador: 0 };
  const newCount: Record<string, number> = { vencido: 0, proximo: 0, ok: 0, foraDoContador: 0 };
  const coveredNow: string[] = [];
  const orphans: number[] = [];

  for (const s of schedules) {
    const vacs = vacsByEmp.get(s.employee_id) || [];
    const dates = [s.period_1_date, s.period_2_date].filter(Boolean) as string[];
    if (!empById.has(s.employee_id)) orphans.push(s.id);

    const uncovered = dates.filter(d => !oldCovered(s, vacs)(d)).sort();
    if (uncovered.length === 0) oldCount.foraDoContador++;
    else oldCount[bucket(uncovered[0], today)]++;

    if (newCovered(s, vacs)) {
      newCount.foraDoContador++;
      coveredNow.push(`${empById.get(s.employee_id)?.name} (sched ${s.id})`);
    } else {
      newCount[bucket([...dates].sort()[0], today)]++;
    }
  }

  console.log(`registros: ${schedules.length} | órfãos: ${orphans.length ? orphans.join(', ') : 'nenhum'} | férias lançadas: ${vacations.length}`);
  console.log('regra antiga:', JSON.stringify(oldCount));
  console.log('regra nova  :', JSON.stringify(newCount));
  console.log(`marcados como concluídos na regra nova (${coveredNow.length}): ${coveredNow.join('; ') || 'nenhum'}`);

  const limites = schedules
    .filter(s => s.period_2_date)
    .map(s => ({ d: s.period_2_date as string, n: empById.get(s.employee_id)?.name }))
    .sort((a, b) => a.d.localeCompare(b.d));
  console.log(`limites já estourados: ${limites.filter(l => l.d < today).length}`);
  console.log('próximos limites:', limites.slice(0, 6).map(l => `${l.d} ${l.n}`).join(' | '));

  const dumpArg = process.argv.find(a => a.startsWith('--dump='))?.slice('--dump='.length);
  if (dumpArg) {
    const apiSchedules = schedules.map(s => ({
      ...s,
      employee_name: empById.get(s.employee_id)?.name ?? '',
      leader_name: empById.get(s.employee_id)?.leader_name ?? '',
    })).sort((a, b) => a.employee_name.localeCompare(b.employee_name));
    const apiVacations = vacations.map(v => ({ ...v, employee_name: empById.get(v.employee_id)?.name ?? '' }));
    fs.writeFileSync(path.resolve(dumpArg), JSON.stringify({
      schedules: apiSchedules,
      vacations: apiVacations,
      expected: newCount,
    }));
    console.log(`dump: ${path.resolve(dumpArg)}`);
  }

  process.exit(0);
}

main().catch(e => { console.error('Erro:', e); process.exit(1); });
