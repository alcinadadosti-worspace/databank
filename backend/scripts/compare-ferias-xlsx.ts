/**
 * Compara a planilha Programacao_de_Ferias_Consolidada.xlsx (raiz) com a
 * colecao vacation_schedules do Firestore. Somente leitura.
 */
import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import * as XLSX from 'xlsx';
import path from 'path';
import fs from 'fs';

if (getApps().length === 0) {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (b64) {
    initializeApp({ credential: cert(JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))) });
  } else {
    const keyPath = path.resolve(process.cwd(), 'firebase-key.json');
    if (!fs.existsSync(keyPath)) {
      console.error('Sem credencial Firebase');
      process.exit(1);
    }
    initializeApp({ credential: cert(JSON.parse(fs.readFileSync(keyPath, 'utf8'))) });
  }
}
const db = getFirestore();

function normalize(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

function parseDateBR(date: string): string {
  const [d, m, y] = date.split('/');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

async function main() {
  const file = path.resolve(__dirname, '..', '..', 'Programacao_de_Ferias_Consolidada.xlsx');
  const wb = XLSX.readFile(file, { cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null });

  const sheet = rows.slice(1)
    .filter(r => r[0] && r[1])
    .map(r => ({ name: String(r[0]).trim(), p1: parseDateBR(String(r[1]).trim()), p2: r[2] ? parseDateBR(String(r[2]).trim()) : null }));

  console.log(`Planilha: ${sheet.length} colaboradores\n`);

  const empSnap = await db.collection('employees').get();
  const employees = empSnap.docs.map(d => d.data() as any);
  const empByName = new Map(employees.map(e => [normalize(e.name), e]));

  const schedSnap = await db.collection('vacation_schedules').get();
  const schedules = schedSnap.docs.map(d => d.data() as any);
  const schedByEmpId = new Map(schedules.map(s => [s.employee_id, s]));
  console.log(`App: ${employees.length} employees, ${schedules.length} vacation_schedules\n`);

  const diffs: string[] = [];
  const ok: string[] = [];
  const noSchedule: string[] = [];
  const notFound: string[] = [];
  const matchedEmpIds = new Set<number>();

  for (const row of sheet) {
    const key = normalize(row.name);
    let emp = empByName.get(key);
    if (!emp) {
      const tokens = key.split(' ').slice(0, 3).join(' ');
      const partials = [...empByName.entries()].filter(([k]) => k.startsWith(tokens));
      if (partials.length === 1) emp = partials[0][1];
    }
    if (!emp) {
      notFound.push(row.name);
      continue;
    }
    matchedEmpIds.add(emp.id);
    const sched = schedByEmpId.get(emp.id);
    if (!sched) {
      noSchedule.push(`${row.name} (emp ${emp.id}) → planilha: P1 ${row.p1} | P2 ${row.p2}`);
      continue;
    }
    const p1Diff = sched.period_1_date !== row.p1;
    const p2Diff = (sched.period_2_date || null) !== row.p2;
    if (p1Diff || p2Diff) {
      diffs.push(
        `${emp.name} (emp ${emp.id}, sched ${sched.id})\n` +
        `    P1: app ${sched.period_1_date} ${p1Diff ? '≠' : '='} planilha ${row.p1}\n` +
        `    P2: app ${sched.period_2_date || '(vazio)'} ${p2Diff ? '≠' : '='} planilha ${row.p2 || '(vazio)'}`
      );
    } else {
      ok.push(emp.name);
    }
  }

  const inAppNotSheet = schedules.filter(s => !matchedEmpIds.has(s.employee_id));

  console.log(`─── IGUAIS (${ok.length}) ───`);
  console.log(ok.join(', ') || '(nenhum)');

  console.log(`\n─── DATAS DIFERENTES (${diffs.length}) ───`);
  for (const d of diffs) console.log('  ' + d);

  console.log(`\n─── NA PLANILHA MAS SEM CADASTRO NA APP (${noSchedule.length}) ───`);
  for (const n of noSchedule) console.log('  ' + n);

  console.log(`\n─── NA PLANILHA MAS NOME NAO ENCONTRADO NOS EMPLOYEES (${notFound.length}) ───`);
  for (const n of notFound) console.log('  ' + n);

  console.log(`\n─── NA APP MAS FORA DA PLANILHA (${inAppNotSheet.length}) ───`);
  for (const s of inAppNotSheet) {
    const emp = employees.find(e => e.id === s.employee_id);
    console.log(`  ${emp ? emp.name : '???'} (emp ${s.employee_id}, sched ${s.id}) — P1 ${s.period_1_date} | P2 ${s.period_2_date || '(vazio)'}`);
  }

  process.exit(0);
}

main().catch(err => { console.error('Erro:', err); process.exit(1); });
