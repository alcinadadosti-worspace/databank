/**
 * Re-sincroniza 10/11/2026 da Sólides SEM nenhuma notificação, só para as 4 da Loja Coruripe.
 * O REP da loja só enviou as saídas de 10/11 às 10:34 de 11/11 — depois da checagem das 10:00 —
 * e nada re-sincroniza o dia anterior depois disso, então o app ficou sem a saída final.
 *
 * Rodar SEMPRE assim (sem token do Slack e em UTC, igual ao Render):
 *   SLACK_BOT_TOKEN= TZ=UTC npx tsx scripts/resync-silent-coruripe-nov10.ts            # teste: mostra o que mudaria
 *   SLACK_BOT_TOKEN= TZ=UTC npx tsx scripts/resync-silent-coruripe-nov10.ts --commit   # grava
 */
import 'dotenv/config';
import { syncPunches } from '../src/jobs/sync-punches';
import * as queries from '../src/models/queries';

const DATE = '2026-11-10';
// Evellyn, Caroline, Rayanne, Ana Paula (Loja Coruripe)
const IDS = new Set([112, 113, 124, 63]);
const TOKEN = process.env.SOLIDES_API_TOKEN!;

const hhmm = (t: number) => { const d = new Date(t - 3 * 3600e3); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };

/** Leitura direta da Sólides (sem gravar API_READ), janela do dia em BRT. */
async function solidesTimes(solidesId: string): Promise<string[]> {
  const [y, m, d] = DATE.split('-').map(Number);
  const start = String(Date.UTC(y, m - 1, d, 3, 0, 0));
  const end = String(Date.UTC(y, m - 1, d, 23, 59, 59) + 3 * 3600e3);
  const times = new Set<number>();
  for (const status of ['APPROVED', 'PENDING']) {
    const u = new URL('https://apis.tangerino.com.br/punch/');
    u.searchParams.set('startDate', start); u.searchParams.set('endDate', end);
    u.searchParams.set('page', '0'); u.searchParams.set('size', '500');
    u.searchParams.set('status', status); u.searchParams.set('employeeId', solidesId);
    const res = await fetch(u.toString(), { headers: { Authorization: TOKEN, Accept: 'application/json' } });
    if (!res.ok) throw new Error(`Sólides ${res.status}: ${(await res.text()).slice(0, 160)}`);
    for (const p of ((await res.json()) as any).content || []) {
      if (p.date !== DATE) continue;
      if (p.dateIn) times.add(p.dateIn);
      if (p.dateOut) times.add(p.dateOut);
    }
  }
  return [...times].sort((a, b) => a - b).map(hhmm);
}

async function show(label: string) {
  const recs = (await queries.getDailyRecordsByDate(DATE)).filter(r => IDS.has(r.employee_id));
  console.log(label);
  for (const r of recs) {
    console.log(`  ${r.employee_id}: ${r.punch_1 ?? '--'} ${r.punch_2 ?? '--'} ${r.punch_3 ?? '--'} ${r.punch_4 ?? '--'} | ${r.classification ?? '(vazio)'} | trabalhado ${r.total_worked_minutes ?? '-'} min, diferença ${r.difference_minutes ?? '-'} | manual ${JSON.stringify(r.manual_punches ?? [])}`);
  }
}

async function main() {
  // Trava 1: sem token, o bot não consegue mandar nada mesmo que algo tente
  if (process.env.SLACK_BOT_TOKEN) throw new Error('Rode com SLACK_BOT_TOKEN= vazio — recusado');
  // Trava 2: dateToMillis do solides-api assume servidor em UTC (Render); em BRT a janela sairia 3h deslocada
  if (new Date(2026, 10, 10).getTime() !== Date.UTC(2026, 10, 10)) throw new Error('Rode com TZ=UTC — recusado');

  await show(`Antes (${DATE}):`);

  const employees = (await queries.getAllEmployees()).filter(e => IDS.has(e.id));
  console.log('\nSólides agora:');
  for (const e of employees) {
    console.log(`  ${e.id} ${e.name}: ${(await solidesTimes(String(e.solides_employee_id))).join(' ')}`);
  }

  if (!process.argv.includes('--commit')) {
    console.log('\nTravas OK. Nada foi gravado (use --commit).');
    return;
  }

  const punches = await syncPunches(DATE, { skipNotifications: true, employeeIds: IDS });
  console.log(`\nSólides devolveu ${punches} pares da empresa; só os 4 acima foram tocados.`);
  await show(`Depois (${DATE}):`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
