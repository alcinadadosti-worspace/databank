import 'dotenv/config';
// SOMENTE LEITURA — sequência de NSR do REP de Coruripe na Sólides: buracos = batidas que o
// relógio registrou e não chegaram na Sólides. Chama a API direto (sem audit). Sem dados pessoais.
const TOKEN = process.env.SOLIDES_API_TOKEN!;
const DEVICE = process.argv[4] || '00014003750393564';
const START = process.argv[2] || '2026-10-27';
const END = process.argv[3] || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
function ms(d: string, end = false) { const [y, m, dd] = d.split('-').map(Number); return String(Date.UTC(y, m - 1, dd, end ? 23 : 0, end ? 59 : 0, end ? 59 : 0) + 3 * 3600e3); }
const brt = (t: number | null | undefined) => t ? new Date(t - 3 * 3600e3).toISOString().slice(5, 16).replace('T', ' ') : '--';
(async () => {
  const byId = new Map<string, any>();
  for (const status of [undefined, 'APPROVED', 'PENDING']) {
    let page = 0, totalPages = 1;
    while (page < totalPages) {
      const u = new URL('https://apis.tangerino.com.br/punch/');
      u.searchParams.set('startDate', ms(START)); u.searchParams.set('endDate', ms(END, true));
      u.searchParams.set('page', String(page)); u.searchParams.set('size', '500');
      if (status) u.searchParams.set('status', status);
      const res = await fetch(u.toString(), { headers: { Authorization: TOKEN, Accept: 'application/json' } });
      if (!res.ok) { console.log(`Sólides ${res.status}: ${(await res.text()).slice(0, 160)}`); break; }
      const data = await res.json() as any;
      totalPages = data.totalPages || 1;
      for (const p of data.content || []) byId.set(String(p.id), p);
      page++;
    }
  }
  const all = [...byId.values()];
  const statuses = new Map<string, number>();
  all.forEach(p => statuses.set(String(p.status), (statuses.get(String(p.status)) ?? 0) + 1));
  console.log(`Empresa toda ${START}..${END}: ${all.length} pares | status: ${[...statuses].map(([k, v]) => `${k}=${v}`).join(' ')}`);
  const devs = new Map<string, Set<string>>();
  for (const p of all) { const k = String(p.devicedId ?? '-'); if (!devs.has(k)) devs.set(k, new Set()); devs.get(k)!.add(String(p.employeeName)); }
  console.log(`Pessoas no aparelho ${DEVICE}: ${[...(devs.get(DEVICE) ?? [])].join(', ')}`);

  const marks: { nsr: number; t: number; who: string; kind: string; arrived: number }[] = [];
  for (const p of all.filter(p => String(p.devicedId) === DEVICE)) {
    if (p.nsrIn != null) marks.push({ nsr: Number(p.nsrIn), t: p.dateIn, who: String(p.employeeName).split(' ')[0], kind: 'in', arrived: p.lastModifiedDate });
    if (p.nsrOut != null && p.dateOut) marks.push({ nsr: Number(p.nsrOut), t: p.dateOut, who: String(p.employeeName).split(' ')[0], kind: 'out', arrived: p.lastModifiedDate });
  }
  marks.sort((a, b) => a.nsr - b.nsr);
  console.log(`\nBatidas do aparelho: ${marks.length} | NSR ${marks[0]?.nsr}..${marks[marks.length - 1]?.nsr}`);
  // Salto enorme = outra numeração (ex.: batidas de 31/10 importadas com NSR 213343+), não batidas perdidas
  const MAX_GAP = 1000;
  let gaps = 0;
  for (let i = 1; i < marks.length; i++) {
    const a = marks[i - 1], b = marks[i];
    if (b.nsr - a.nsr > MAX_GAP) {
      console.log(`  SALTO DE NUMERAÇÃO: ${a.nsr} → ${b.nsr} (${brt(a.t)} → ${brt(b.t)}) — outra sequência, não conta como faltando`);
    } else if (b.nsr - a.nsr > 1) {
      gaps += b.nsr - a.nsr - 1;
      console.log(`  BURACO: NSR ${a.nsr + 1}..${b.nsr - 1} (${b.nsr - a.nsr - 1} faltando) entre ${brt(a.t)} ${a.who}/${a.kind} e ${brt(b.t)} ${b.who}/${b.kind}`);
    } else if (b.nsr === a.nsr) {
      console.log(`  NSR repetido ${a.nsr}: ${brt(a.t)} ${a.who} / ${brt(b.t)} ${b.who}`);
    }
  }
  console.log(`Total faltando na sequência: ${gaps}`);
  // lastModifiedDate é do par (entrada+saída): é um limite superior de quando a batida chegou,
  // não a hora exata do primeiro envio do dia
  const firstArrivalByDay = new Map<string, number>();
  for (const m of marks) { const d = brt(m.arrived).slice(0, 5); if (!firstArrivalByDay.has(d) || m.arrived < firstArrivalByDay.get(d)!) firstArrivalByDay.set(d, m.arrived); }
  console.log('\nPrimeira atualização de par na Sólides por dia (lastModifiedDate):');
  [...firstArrivalByDay.entries()].sort().forEach(([d, t]) => console.log(`  ${d}: ${brt(t)}`));
})().catch(e => { console.error(e); process.exit(1); });
