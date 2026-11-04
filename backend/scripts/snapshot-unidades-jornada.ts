import 'dotenv/config';
import fs from 'fs';
import * as queries from '../src/models/queries';
import * as C from '../src/config/constants';
import { calculateDailyHours } from '../src/services/hours-calculator';

/**
 * Somente leitura: "foto" de em qual card cada pessoa aparece (aba Unidades) e da jornada
 * calculada para cada uma. Serve para comparar antes/depois de trocar as listas de nomes
 * do código por campos no cadastro. Não grava nada no Firestore.
 *   npx tsx scripts/snapshot-unidades-jornada.ts --out <arquivo.json> [--obj]
 * --obj: passa o cadastro inteiro para as regras de jornada (código novo); sem ele, só o nome (código antigo).
 */
const useObj = process.argv.includes('--obj');
const out = process.argv[process.argv.indexOf('--out') + 1];

async function main() {
  const dates = ['2026-11-04', '2026-10-31', '2026-11-01']; // quarta, sábado, domingo
  const result: any = { units: {}, schedule: {} };
  for (const d of dates) {
    const units = await queries.getUnitRecords(d);
    result.units[d] = units
      .map(u => ({ leader_id: u.leader_id, unit_name: u.unit_name, employees: u.employees.map(e => e.id).sort((a, b) => a - b), exempt: u.employees.filter(e => e.is_exempt_today).map(e => e.id).sort((a, b) => a - b) }))
      .sort((a, b) => `${a.unit_name}|${a.leader_id}`.localeCompare(`${b.unit_name}|${b.leader_id}`));
  }
  const emps = await queries.getAllEmployees();
  for (const e of emps) {
    const subject: any = useObj ? e : e.name;
    const calc = (date: string, p: [string, string, string | null, string | null]) => {
      const opts: any = { date, isApprentice: e.is_apprentice === true, scheduleOverrides: e.schedule_overrides };
      if (useObj) opts.employee = e; else opts.employeeName = e.name;
      const r = calculateDailyHours({ punch1: p[0], punch2: p[1], punch3: p[2], punch4: p[3] }, opts);
      return r ? `${r.totalWorkedMinutes}/${r.differenceMinutes}/${r.classification}` : null;
    };
    result.schedule[e.id] = {
      name: e.name,
      sat: C.getSaturdayMinutes(subject),
      sust: C.isLojaSustentavelEmployee(subject),
      noLunch: C.isNoLunchEmployee(subject),
      expWeekday: C.getExpectedMinutes('2026-11-04', e.is_apprentice === true, e.expected_daily_minutes || 240, subject, e.schedule_overrides),
      expSat: C.getExpectedMinutes('2026-10-31', e.is_apprentice === true, e.expected_daily_minutes || 240, subject, e.schedule_overrides),
      calcWeekday: calc('2026-11-04', ['08:00', '12:00', '14:00', '18:00']),
      calcSat: calc('2026-10-31', ['08:00', '14:00', null, null]),
      calcSun: calc('2026-11-01', ['09:00', '20:00', null, null]),
      workSun: await queries.isWorkingDayForEmployee('2026-11-01', e),
      missingWeekday: queries.computeMissingPunchesForRecord({ date: '2026-11-04', punch_1: '08:00', punch_2: '12:00' }, e).join(','),
    };
  }
  fs.writeFileSync(out, JSON.stringify(result, null, 1));
  const cards = Object.values(result.units).map((u: any) => u.length);
  console.log(`ok: ${emps.length} colaboradores; cards por data: ${cards.join('/')} → ${out}`);
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
