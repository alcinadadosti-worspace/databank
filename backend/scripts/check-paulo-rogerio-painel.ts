/** Verifica onde o Paulo Rogerio (emp 87) aparece no painel apos ganhar leader_id 2. Somente leitura. */
import 'dotenv/config';
import * as q from '../src/models/queries';

const DATE = '2026-08-03';
const EMP = 87;

async function main() {
  const units = await q.getUnitRecords(DATE);

  console.log('--- ONDE O EMP 87 APARECE ---');
  let achou = false;
  for (const u of units) {
    const hit = u.employees.find((e: any) => e.id === EMP);
    if (hit) {
      achou = true;
      console.log(`  unidade "${u.unit_name}" | leader_id da unidade: ${u.leader_id} | present: ${hit.present}`);
    }
  }
  if (!achou) console.log('  (nao aparece em nenhuma unidade)');

  console.log('\n--- UNIDADES COM leader_id 2 (Alberto) ---');
  const alberto = units.filter(u => u.leader_id === 2);
  if (!alberto.length) console.log('  (nenhuma unidade com leader_id 2)');
  for (const u of alberto) {
    console.log(`  "${u.unit_name}": ${u.employees.map((e: any) => e.id + ':' + e.name).join(', ')}`);
  }

  const sp = units.find(u => u.unit_name === 'Sem Ponto');
  console.log(`\n--- CARD "Sem Ponto" (leader_id ${sp ? sp.leader_id : '-'}) ---`);
  if (sp) for (const e of sp.employees as any[]) console.log(`  emp ${e.id} - ${e.name} | present: ${e.present}`);

  // A aba Ausencias do gestor filtra unidades por leader_id === manager.id
  const ausenciasDoAlberto = units
    .filter(u => u.leader_id === 2)
    .flatMap(u => (u.employees as any[]).filter(e => !e.present).map(e => `${e.id}:${e.name} (${u.unit_name})`));
  console.log('\n--- O QUE O ALBERTO VE NA ABA AUSENCIAS ---');
  console.log(ausenciasDoAlberto.length ? '  ' + ausenciasDoAlberto.join('\n  ') : '  (ninguem)');

  process.exit(0);
}

main().catch(e => { console.error('Erro:', e); process.exit(1); });
