import { getDb } from './src/models/database';

async function main() {
  const db = getDb();

  const leadersSnap = await db.collection('leaders').orderBy('id').get();
  const leaders: any[] = [];
  leadersSnap.forEach(doc => leaders.push(doc.data()));

  const employeesSnap = await db.collection('employees').get();
  const employees: any[] = [];
  employeesSnap.forEach(doc => employees.push(doc.data()));

  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    HIERARQUIA DATABANK                         ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  console.log('=== GESTORES ===');
  console.log('');
  for (const l of leaders) {
    const empCount = employees.filter(e => e.leader_id === l.id).length;
    const sector = l.sector || 'N/A';
    const slack = l.slack_id ? 'Sim' : 'Nao';
    console.log(`ID ${l.id}: ${l.name}`);
    console.log(`   Setor: ${sector} | Slack: ${slack} | Colaboradores: ${empCount}`);
  }

  console.log('');
  console.log('=== COLABORADORES POR GESTOR ===');

  for (const l of leaders) {
    const emps = employees.filter(e => e.leader_id === l.id).sort((a, b) => a.name.localeCompare(b.name));
    if (emps.length > 0) {
      console.log('');
      console.log(`[${l.name}] (${emps.length} colaboradores):`);
      for (const e of emps) {
        const flags: string[] = [];
        if (e.is_apprentice) flags.push('Aprendiz');
        if (e.works_saturday === false) flags.push('Nao trab. sabado');
        if (e.no_punch_required) flags.push('Sem ponto');
        const flagStr = flags.length > 0 ? ` [${flags.join(', ')}]` : '';
        console.log(`  - ${e.name}${flagStr}`);
      }
    }
  }

  console.log('');
  console.log('=== RESUMO ===');
  console.log(`Total Gestores: ${leaders.length}`);
  console.log(`Total Colaboradores: ${employees.length}`);
  console.log(`Com Slack: ${employees.filter(e => e.slack_id).length}`);
  console.log(`Aprendizes: ${employees.filter(e => e.is_apprentice).length}`);
  console.log(`Nao trabalham sabado: ${employees.filter(e => e.works_saturday === false).length}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
