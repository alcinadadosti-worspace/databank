/** Imprime linhas cruas da planilha 2 para conferir as colunas de dias. Somente leitura. */
import * as XLSX from 'xlsx';
import path from 'path';

const file = path.resolve(__dirname, '..', '..', 'Programacao_de_Ferias_Consolidada2.xlsx');
const wb = XLSX.readFile(file, { cellDates: false });
const rows: any[][] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: null });

console.log('Header:', JSON.stringify(rows[0]));
console.log('\nTodas as linhas (nome | Dir | Goz | Rest):');
for (const r of rows.slice(1)) {
  if (!r[0]) continue;
  console.log(`${String(r[0]).padEnd(45)} | ${r[3]} | ${r[4]} | ${r[5]}`);
}
