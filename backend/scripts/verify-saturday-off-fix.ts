/** READ-ONLY: simula getUnitRecords no sabado 2026-08-15 e mostra quem aparece ausente + status dos aprendizes sem sabado. */
import 'dotenv/config';
import { getUnitRecords } from '../src/models/queries';

const TARGETS = ['yuri castro', 'raquele fragoso', 'brunna isabelly'];

async function main() {
  const units = await getUnitRecords('2026-08-15');
  console.log('=== Aprendizes-alvo no sabado 15/08 ===');
  for (const unit of units) {
    for (const emp of unit.employees) {
      if (TARGETS.some(t => emp.name.toLowerCase().includes(t))) {
        console.log(`${emp.name} | unidade=${unit.unit_name} | present=${emp.present} exempt=${emp.is_exempt_today} apprentice=${emp.is_apprentice}`);
      }
    }
  }
  console.log('\n=== Todos ainda listados como AUSENTES no sabado 15/08 ===');
  for (const unit of units) {
    for (const emp of unit.employees) {
      if (!emp.present) console.log(`${emp.name} | ${unit.unit_name}`);
    }
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
