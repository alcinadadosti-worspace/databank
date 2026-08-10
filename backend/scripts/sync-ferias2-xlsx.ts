/**
 * Sincroniza vacation_schedules com a planilha Programacao_de_Ferias_Consolidada2.xlsx (raiz).
 * Alem das datas (Vencto. / Limite p/ Gozo), sincroniza as colunas novas:
 *   Dias Dir. -> days_entitled | Dias Goz. -> days_taken | Dias Rest. -> days_remaining
 *
 *   - Atualiza registros cujos campos divergem da planilha
 *   - Cria registros para colaboradores da planilha sem cadastro
 *   - NAO mexe em registros fora da planilha (ex.: orfao sched 80)
 *
 * Uso: npx tsx scripts/sync-ferias2-xlsx.ts [--apply]   (sem --apply = simulacao)
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

  const file = path.resolve(__dirname, '..', '..', 'Programacao_de_Ferias_Consolidada2.xlsx');
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

  let nextSchedId = schedules.reduce((m, s) => Math.max(m, s.id || 0), 0) + 1;

  let updated = 0, created = 0, unchanged = 0;
  const notFound: string[] = [];
  const now = new Date().toISOString();

  for (const row of sheet) {
    let key = normalize(row.name);
    if (ALIASES[key]) key = ALIASES[key];

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

  process.exit(0);
}

main().catch(e => { console.error('Erro:', e); process.exit(1); });
