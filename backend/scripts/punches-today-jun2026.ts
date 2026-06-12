import 'dotenv/config';

const TOKEN = process.env.SOLIDES_API_TOKEN!;
const PUNCH_URL = 'https://apis.tangerino.com.br/punch';

function dateToMillis(dateStr: string, endOfDay = false): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, 0);
  return String(date.getTime() + 3 * 60 * 60 * 1000);
}
function millisToTime(millis: number): string {
  const d = new Date(millis);
  const h = (d.getUTCHours() - 3 + 24) % 24;
  return `${String(h).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

const TODAY = '2026-06-12';
const INTERESTING = new Set(['6553230', '6555622', '6270908', '6232340', '6573320', '6571930']);

async function main() {
  for (const status of ['APPROVED', 'PENDING']) {
    const url = new URL(PUNCH_URL + '/');
    url.searchParams.set('startDate', dateToMillis(TODAY));
    url.searchParams.set('endDate', dateToMillis(TODAY, true));
    url.searchParams.set('page', '0');
    url.searchParams.set('size', '500');
    url.searchParams.set('status', status);
    const res = await fetch(url.toString(), { headers: { Authorization: TOKEN, Accept: 'application/json' } });
    const data: any = await res.json();
    for (const p of data.content || []) {
      const empId = String(p.employeeId || p.employee?.id);
      const name = p.employeeName || p.employee?.name || '';
      if (INTERESTING.has(empId) || name.toLowerCase().includes('sione') || name.toLowerCase().includes('samuel')) {
        console.log(`[${status}] ${empId} ${name}: in=${p.dateIn ? millisToTime(p.dateIn) : '-'} out=${p.dateOut ? millisToTime(p.dateOut) : '-'} (${p.date})`);
      }
    }
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
