import * as XLSX from 'xlsx';
import path from 'path';

const file = path.resolve(__dirname, '..', '..', 'Programacao_de_Ferias_Consolidada2.xlsx');
const wb = XLSX.readFile(file, { cellDates: false });

console.log('Abas:', wb.SheetNames.join(' | '));

for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null });
  console.log(`\n=== Aba "${name}" (${rows.length} linhas) ===`);
  rows.slice(0, 10).forEach((r, i) => console.log(`${i}: ${JSON.stringify(r)}`));
}
