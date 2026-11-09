/**
 * Sincroniza vacation_schedules com a planilha Programacao_de_Ferias_Consolidada2.xlsx (raiz).
 * Alem das datas (Vencto. / Limite p/ Gozo), sincroniza as colunas novas:
 *   Dias Dir. -> days_entitled | Dias Goz. -> days_taken | Dias Rest. -> days_remaining
 *
 *   - Atualiza registros cujos campos divergem da planilha
 *   - Cria registros para colaboradores da planilha sem cadastro
 *   - NAO mexe em registros fora da planilha (ex.: orfao sched 80)
 *
 * Uso: npx tsx scripts/sync-ferias2-xlsx.ts [--file=caminho.xlsx] [--apply --backup=arquivo.json]   (sem --apply = simulacao)
 *      Os xlsx saem de scripts/consolidate-ferias-pdfs.py, a partir dos PDFs de programacao de ferias.
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
    initializeApp({ credential: cert(JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'firebase-key.json'), 'utf8'))) });
  }
}
const db = getFirestore();
const APPLY = process.argv.includes('--apply');

function normalize(name: string) {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

function parseDateBR(date: string): string {
  const [d, m, y] = date.split('/');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function parseDays(v: any): number | null {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  // Aceita decimais (ex.: 27.5 dias) e vírgula como separador
  const n = parseFloat(String(v).trim().replace(',', '.'));
  return Number.isNaN(n) ? null : n;
}

// Grafias da planilha -> nome cadastrado na app (chaves e valores normalizados)
const ALIASES: Record<string, string> = {
  'raquele frangoso da silva': 'raquele fragoso da silva',
  'deise gislane silva vitor': 'deise gislaine silva vitor',
  'joanna roberta de queiroz viana': 'joanna queiroz',
  'josenildo alves da silva junior': 'josenildo alves',
  'shayane oliveira ferreira': 'shayane ferreira',
};

async function main() {
  console.log(`=== Sync férias × planilha 2 (com saldo de dias) — modo: ${APPLY ? 'APLICAR' : 'SIMULACAO'} ===\n`);

  const fileArg = process.argv.find(a => a.startsWith('--file='))?.slice('--file='.length);
  const file = fileArg ? path.resolve(fileArg) : path.resolve(__dirname, '..', '..', 'Programacao_de_Ferias_Consolidada2.xlsx');
  console.log(`Arquivo: ${file}\n`);
  const wb = XLSX.readFile(file, { cellDates: false });
  const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: null });
  const sheet = rows.slice(1)
    .filter(r => r[0] && r[1])
    .map(r => ({
      name: String(r[0]).trim(),
      p1: parseDateBR(String(r[1]).trim()),
      p2: r[2] ? parseDateBR(String(r[2]).trim()) : null,
      entitled: parseDays(r[3]),
      taken: parseDays(r[4]),
      remaining: parseDays(r[5]),
    }));

  const empSnap = await db.collection('employees').get();
  const employees = empSnap.docs.map(d => d.data() as any);
  const empByName = new Map(employees.map(e => [normalize(e.name), e]));

  const schedSnap = await db.collection('vacation_schedules').get();
  const schedules = schedSnap.docs.map(d => d.data() as any);
  const schedByEmpId = new Map(schedules.map(s => [s.employee_id, s]));

  if (APPLY) {
    const backupArg = process.argv.find(a => a.startsWith('--backup='))?.slice('--backup='.length);
    if (!backupArg) throw new Error('--apply exige --backup=arquivo.json');
    // flag wx: nao sobrescreve um backup anterior
    fs.writeFileSync(path.resolve(backupArg), JSON.stringify(schedSnap.docs.map(d => ({ doc_id: d.id, ...d.data() })), null, 2), { flag: 'wx' });
    console.log(`Backup de ${schedSnap.size} registros: ${path.resolve(backupArg)}\n`);
  }

  let nextSchedId = schedules.reduce((m, s) => Math.max(m, s.id || 0), 0) + 1;

  let updated = 0, created = 0, unchanged = 0;
  const notFound: string[] = [];
  const matchNotes: string[] = [];
  const seenEmpIds = new Set<number>();
  const now = new Date().toISOString();

  for (const row of sheet) {
    let key = normalize(row.name);
    if (ALIASES[key]) {
      matchNotes.push(`apelido: "${row.name}" → "${ALIASES[key]}"`);
      key = ALIASES[key];
    }

    let emp = empByName.get(key);
    if (!emp) {
      const tokens = key.split(' ').slice(0, 3).join(' ');
      const partials = [...empByName.entries()].filter(([k]) => k.startsWith(tokens));
      if (partials.length === 1) {
        emp = partials[0][1];
        matchNotes.push(`parcial: "${row.name}" → "${emp.name}" (emp ${emp.id})`);
      }
    }
    if (!emp) {
      notFound.push(row.name);
      continue;
    }
    if (seenEmpIds.has(emp.id)) throw new Error(`Duas linhas da planilha caem no emp ${emp.id} (${emp.name}) — abortando`);
    seenEmpIds.add(emp.id);

    const sched = schedByEmpId.get(emp.id);

    if (sched) {
      const diffs: string[] = [];
      if (sched.period_1_date !== row.p1) diffs.push(`P1 ${sched.period_1_date} → ${row.p1}`);
      if ((sched.period_2_date || null) !== row.p2) diffs.push(`P2 ${sched.period_2_date || '(vazio)'} → ${row.p2 || '(vazio)'}`);
      if ((sched.days_entitled ?? null) !== row.entitled) diffs.push(`Dir. ${sched.days_entitled ?? '(vazio)'} → ${row.entitled ?? '(vazio)'}`);
      if ((sched.days_taken ?? null) !== row.taken) diffs.push(`Goz. ${sched.days_taken ?? '(vazio)'} → ${row.taken ?? '(vazio)'}`);
      if ((sched.days_remaining ?? null) !== row.remaining) diffs.push(`Rest. ${sched.days_remaining ?? '(vazio)'} → ${row.remaining ?? '(vazio)'}`);
      if (diffs.length === 0) {
        unchanged++;
        continue;
      }
      console.log(`  ~ ATUALIZA ${emp.name} (emp ${emp.id}, sched ${sched.id}):`);
      diffs.forEach(d => console.log(`      ${d}`));
      if (APPLY) {
        await db.collection('vacation_schedules').doc(String(sched.id)).update({
          period_1_date: row.p1,
          period_2_date: row.p2,
          days_entitled: row.entitled,
          days_taken: row.taken,
          days_remaining: row.remaining,
          updated_at: now,
        });
      }
      updated++;
    } else {
      const id = nextSchedId++;
      console.log(`  + CRIA ${emp.name} (emp ${emp.id}, sched ${id}): P1 ${row.p1} | P2 ${row.p2 || '(vazio)'} | Dir. ${row.entitled ?? '—'} Goz. ${row.taken ?? '—'} Rest. ${row.remaining ?? '—'}`);
      if (APPLY) {
        const ref = db.collection('vacation_schedules').doc(String(id));
        if ((await ref.get()).exists) throw new Error(`Doc vacation_schedules/${id} ja existe — abortando`);
        await ref.set({
          id,
          employee_id: emp.id,
          period_1_date: row.p1,
          period_2_date: row.p2,
          days_entitled: row.entitled,
          days_taken: row.taken,
          days_remaining: row.remaining,
          notes: null,
          created_at: now,
          updated_at: now,
        });
      }
      created++;
    }
  }

  if (APPLY && created > 0) {
    const finalMax = nextSchedId - 1;
    const counterRef = db.collection('counters').doc('vacation_schedules');
    await db.runTransaction(async tx => {
      const c = await tx.get(counterRef);
      const current = c.exists ? (c.data()!.value as number) : 0;
      if (current < finalMax) tx.set(counterRef, { value: finalMax });
    });
    console.log(`\n  counter vacation_schedules ajustado para ${finalMax}`);
  }

  console.log(`\n─── Resumo (${APPLY ? 'aplicado' : 'simulacao'}) ───`);
  console.log(`  Sem mudanca: ${unchanged}`);
  console.log(`  Atualizados: ${updated}`);
  console.log(`  Criados:     ${created}`);
  console.log(`  Sem employee na app (ignorados): ${notFound.length}${notFound.length ? ' — ' + notFound.join(', ') : ''}`);

  console.log(`\n─── Casamentos por nome nao exato (${matchNotes.length}) ───`);
  matchNotes.forEach(n => console.log(`  ${n}`));

  const empById = new Map(employees.map(e => [e.id, e]));
  const outOfSheet = schedules.filter(s => !seenEmpIds.has(s.employee_id));
  console.log(`\n─── Registros de vencimento fora da planilha, nao mexidos (${outOfSheet.length}) ───`);
  outOfSheet.forEach(s => {
    const e = empById.get(s.employee_id);
    console.log(`  sched ${s.id} | emp ${s.employee_id} ${e ? e.name : '(EMPLOYEE NAO EXISTE)'} | ${s.period_1_date} / ${s.period_2_date || '—'}`);
  });

  const scheduled = new Set(schedules.map(s => s.employee_id));
  const noSchedule = employees.filter(e => !scheduled.has(e.id) && !seenEmpIds.has(e.id));
  console.log(`\n─── Colaboradores sem vencimento e fora da planilha (${noSchedule.length}) ───`);
  noSchedule.forEach(e => console.log(`  emp ${e.id} ${e.name}${e.no_punch_required ? ' (sem ponto)' : ''}`));

  process.exit(0);
}

main().catch(e => { console.error('Erro:', e); process.exit(1); });
