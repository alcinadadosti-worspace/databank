/**
 * Migration: Restructure leadership for VD and Loja channels
 *
 * Changes:
 * 1. Ana Clara and Erick Café OLD Loja employees → Maria Taciane
 * 2. Ana Clara moves to VD under Romulo with NEW employees (from Joao Antonio's current team)
 * 3. Erick Café moves to VD under Romulo with NEW employees (from Joao Antonio's current team)
 * 4. Joao Antonio keeps only specific employees + new ones
 * 5. Leidiane's Loja Palmeira employees → Kemilly
 */

import * as queries from '../models/queries';

// Helper to normalize names for comparison
function normalize(name: string): string {
  return name.toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

async function main() {
  console.log('=== Starting Leadership Restructure Migration ===\n');

  // Get all current leaders and employees
  const allLeaders = await queries.getAllLeaders();
  const allEmployees = await queries.getAllEmployees();

  console.log(`Found ${allLeaders.length} leaders and ${allEmployees.length} employees\n`);

  // Find leaders by name
  const findLeader = (name: string) => {
    const norm = normalize(name);
    return allLeaders.find(l => normalize(l.name) === norm);
  };

  const findEmployee = (name: string) => {
    const norm = normalize(name);
    return allEmployees.find(e => normalize(e.name) === norm);
  };

  // Key leaders
  const romulo = findLeader('Romulo Jose Santos Lisboa');
  const joaoAntonio = findLeader('Joao Antonio Tavares Santos');
  const anaClara = findLeader('Ana Clara de Matos Chagas');
  const erickCafe = findLeader('Erick Café Santos Júnior') || findLeader('Erick Cafe Santos Junior');
  const mariaTaciane = findLeader('Maria Taciane Pereira Barbosa');
  const kemilly = findLeader('Kemilly Rafaelly Souza Silva');
  const leidiane = findLeader('Leidiane Souza');

  console.log('=== Leaders Found ===');
  console.log('Romulo:', romulo ? `ID ${romulo.id}` : 'NOT FOUND');
  console.log('Joao Antonio:', joaoAntonio ? `ID ${joaoAntonio.id}` : 'NOT FOUND');
  console.log('Ana Clara:', anaClara ? `ID ${anaClara.id}` : 'NOT FOUND');
  console.log('Erick Café:', erickCafe ? `ID ${erickCafe.id}` : 'NOT FOUND');
  console.log('Maria Taciane:', mariaTaciane ? `ID ${mariaTaciane.id}` : 'NOT FOUND');
  console.log('Kemilly:', kemilly ? `ID ${kemilly.id}` : 'NOT FOUND');
  console.log('Leidiane:', leidiane ? `ID ${leidiane.id}` : 'NOT FOUND');

  if (!romulo || !joaoAntonio || !anaClara || !erickCafe || !mariaTaciane || !kemilly) {
    console.error('\nERROR: Missing required leaders. Cannot proceed.');
    return;
  }

  // Define the NEW team assignments

  // Joao Antonio's NEW team (VD Base)
  const joaoNewTeamNames = [
    'Joyce cassimiro souto',
    'Bruna Candido de Lima',           // NEW - needs creation with solides: 3610024, slack: U088MU33XRC
    'Karine Celestino Evangelista dos Santos', // NEW - needs creation with solides: 5464758, slack: U09B6LQ3FFY
    'Gessyca Nayara Rocha Santos',     // EXISTS - solides: 2902140, slack: U08JJH9BWP5
    'Maria Tatiane Oliveira Santos',   // NEW - needs creation with solides: 2902152, slack: U087HG1B4DB
  ];

  // Ana Clara's NEW VD team
  const anaClaraNewTeamNames = [
    'Rodrigo Augusto Teixeira Dos Santos',
    'David da Silva Bento',
    'Sandra da Conceição Freitas',
    'Thalita Ruanna Santos Pereira',
    'Anny Karoline Andrade Santos',    // NEW - needs creation
    'Kamilla Santos da Silva',
    'Lucrécia Severo Ferreira',        // From Joao Antonio
    'Yuri Castro Gomes',               // From Joao Antonio
  ];

  // Erick Café's NEW VD team
  const erickNewTeamNames = [
    'Luciene Da Silva Nascimento',     // NEW - solides: 2902110, slack: U0AA4R2LSUS
    'Giselle Dos Santos Roberto',
    'Emanoelle Feitosa Vieira Santos',
    'Natali de Souza Gonzaga',
    'Laís Manuelle Santos Pereira',    // solides: 3905659, slack: U08UMBX0CP4
    'Kauanne Iwashita Da Silva',
    'Sabrina Domingos Santos',
    'Nathalia Vieira Lima',
    'Leticia Seixas Santos',
    'Gessica Aparecida Dos Santos',
    'Ana Luiza Dos Santos',            // NEW - solides: 2902124, slack: U08ERHMN6F9
  ];

  // Leidiane's Loja Palmeira employees → Kemilly
  const leidianeLojaPalmeiraEmployees = [
    'Yasmin Abilia Ferro da Silva',
    'Robéria Gilo Da Silva',
    'Valesca Meirelle Bezerra Vitória',
  ];

  // New employees data (for creation)
  const newEmployeesData: Record<string, { solides_id: string | null; slack_id: string | null }> = {
    'bruna candido de lima': { solides_id: '3610024', slack_id: 'U088MU33XRC' },
    'karine celestino evangelista dos santos': { solides_id: '5464758', slack_id: 'U09B6LQ3FFY' },
    'gessyca nayara rocha santos': { solides_id: '2902140', slack_id: 'U08JJH9BWP5' },
    'maria tatiane oliveira santos': { solides_id: '2902152', slack_id: 'U087HG1B4DB' },
    'luciene da silva nascimento': { solides_id: '2902110', slack_id: 'U0AA4R2LSUS' },
    'lais manuelle santos pereira': { solides_id: '3905659', slack_id: 'U08UMBX0CP4' },
    'ana luiza dos santos': { solides_id: '2902124', slack_id: 'U08ERHMN6F9' },
  };

  // Show current assignments
  console.log('\n=== Current Teams ===\n');

  const anaClaraCurrentEmps = allEmployees.filter(e => e.leader_id === anaClara.id);
  console.log(`Ana Clara (ID ${anaClara.id}) - ${anaClaraCurrentEmps.length} employees:`);
  anaClaraCurrentEmps.forEach(e => console.log(`  - ${e.name} (ID ${e.id})`));

  const erickCurrentEmps = allEmployees.filter(e => e.leader_id === erickCafe.id);
  console.log(`\nErick Café (ID ${erickCafe.id}) - ${erickCurrentEmps.length} employees:`);
  erickCurrentEmps.forEach(e => console.log(`  - ${e.name} (ID ${e.id})`));

  const joaoCurrentEmps = allEmployees.filter(e => e.leader_id === joaoAntonio.id);
  console.log(`\nJoao Antonio (ID ${joaoAntonio.id}) - ${joaoCurrentEmps.length} employees:`);
  joaoCurrentEmps.forEach(e => console.log(`  - ${e.name} (ID ${e.id})`));

  if (leidiane) {
    const leidianeCurrentEmps = allEmployees.filter(e => e.leader_id === leidiane.id);
    // Filter out employees that are also leaders (they have their own leader entry)
    const leidianeRegularEmps = leidianeCurrentEmps.filter(e => !allLeaders.some(l => normalize(l.name) === normalize(e.name)));
    console.log(`\nLeidiane (ID ${leidiane.id}) - ${leidianeRegularEmps.length} regular employees:`);
    leidianeRegularEmps.forEach(e => console.log(`  - ${e.name} (ID ${e.id})`));
  }

  // Check for --execute flag
  const shouldExecute = process.argv.includes('--execute');

  if (!shouldExecute) {
    console.log('\n=== PLANNED CHANGES (DRY RUN) ===\n');

    console.log('1. Move Ana Clara OLD employees to Maria Taciane:');
    anaClaraCurrentEmps.forEach(e => console.log(`   - ${e.name}`));

    console.log('\n2. Move Erick Café OLD employees to Maria Taciane:');
    erickCurrentEmps.forEach(e => console.log(`   - ${e.name}`));

    console.log('\n3. Joao Antonio NEW team:');
    joaoNewTeamNames.forEach(name => {
      const existing = findEmployee(name);
      console.log(`   - ${name} ${existing ? `(EXISTS ID ${existing.id})` : '(CREATE NEW)'}`);
    });

    console.log('\n4. Ana Clara NEW VD team:');
    anaClaraNewTeamNames.forEach(name => {
      const existing = findEmployee(name);
      console.log(`   - ${name} ${existing ? `(EXISTS ID ${existing.id})` : '(CREATE NEW)'}`);
    });

    console.log('\n5. Erick Café NEW VD team:');
    erickNewTeamNames.forEach(name => {
      const existing = findEmployee(name);
      console.log(`   - ${name} ${existing ? `(EXISTS ID ${existing.id})` : '(CREATE NEW)'}`);
    });

    console.log('\n6. Move Leidiane Loja Palmeira employees to Kemilly:');
    leidianeLojaPalmeiraEmployees.forEach(name => {
      const existing = findEmployee(name);
      console.log(`   - ${name} ${existing ? `(EXISTS ID ${existing.id})` : '(CREATE NEW)'}`);
    });

    console.log('\n7. Update Ana Clara sector to Canal VD under Romulo');
    console.log('8. Update Erick Café sector to Canal VD under Romulo');

    console.log('\n=== To execute, run with --execute flag ===');
    return;
  }

  // ========== EXECUTE MIGRATION ==========
  console.log('\n=== EXECUTING MIGRATION ===\n');

  // STEP 1: Move Ana Clara's OLD employees to Maria Taciane
  console.log('Step 1: Moving Ana Clara OLD employees to Maria Taciane...');
  for (const emp of anaClaraCurrentEmps) {
    await queries.updateEmployeeLeader(emp.id, mariaTaciane.id);
    console.log(`  ✓ Moved ${emp.name} → Maria Taciane`);
  }

  // STEP 2: Move Erick Café's OLD employees to Maria Taciane
  console.log('\nStep 2: Moving Erick Café OLD employees to Maria Taciane...');
  for (const emp of erickCurrentEmps) {
    await queries.updateEmployeeLeader(emp.id, mariaTaciane.id);
    console.log(`  ✓ Moved ${emp.name} → Maria Taciane`);
  }

  // STEP 3: Move Leidiane's Loja Palmeira employees to Kemilly
  console.log('\nStep 3: Moving Leidiane Loja Palmeira employees to Kemilly...');
  for (const name of leidianeLojaPalmeiraEmployees) {
    const existing = findEmployee(name);
    if (existing) {
      await queries.updateEmployeeLeader(existing.id, kemilly.id);
      console.log(`  ✓ Moved ${name} → Kemilly`);
    } else {
      // Create new employee under Kemilly
      await queries.insertEmployeeFull(name, null, kemilly.id, null);
      console.log(`  ✓ Created ${name} → Kemilly`);
    }
  }

  // STEP 4: Set up Joao Antonio's NEW team
  console.log('\nStep 4: Setting up Joao Antonio NEW team...');
  for (const name of joaoNewTeamNames) {
    const existing = findEmployee(name);
    const empData = newEmployeesData[normalize(name)];

    if (existing) {
      await queries.updateEmployeeFull(existing.id, {
        leader_id: joaoAntonio.id,
        slack_id: empData?.slack_id || undefined,
        solides_employee_id: empData?.solides_id || undefined,
      });
      console.log(`  ✓ Updated ${name} → Joao Antonio`);
    } else {
      await queries.insertEmployeeFull(
        name,
        empData?.slack_id || null,
        joaoAntonio.id,
        empData?.solides_id || null
      );
      console.log(`  ✓ Created ${name} → Joao Antonio`);
    }
  }

  // STEP 5: Set up Ana Clara's NEW VD team
  console.log('\nStep 5: Setting up Ana Clara NEW VD team...');
  for (const name of anaClaraNewTeamNames) {
    const existing = findEmployee(name);
    const empData = newEmployeesData[normalize(name)];

    if (existing) {
      await queries.updateEmployeeFull(existing.id, {
        leader_id: anaClara.id,
        slack_id: empData?.slack_id || undefined,
        solides_employee_id: empData?.solides_id || undefined,
      });
      console.log(`  ✓ Updated ${name} → Ana Clara`);
    } else {
      await queries.insertEmployeeFull(
        name,
        empData?.slack_id || null,
        anaClara.id,
        empData?.solides_id || null
      );
      console.log(`  ✓ Created ${name} → Ana Clara`);
    }
  }

  // STEP 6: Set up Erick Café's NEW VD team
  console.log('\nStep 6: Setting up Erick Café NEW VD team...');
  for (const name of erickNewTeamNames) {
    const existing = findEmployee(name);
    const empData = newEmployeesData[normalize(name)];

    if (existing) {
      await queries.updateEmployeeFull(existing.id, {
        leader_id: erickCafe.id,
        slack_id: empData?.slack_id || undefined,
        solides_employee_id: empData?.solides_id || undefined,
      });
      console.log(`  ✓ Updated ${name} → Erick Café`);
    } else {
      await queries.insertEmployeeFull(
        name,
        empData?.slack_id || null,
        erickCafe.id,
        empData?.solides_id || null
      );
      console.log(`  ✓ Created ${name} → Erick Café`);
    }
  }

  // STEP 7: Update Ana Clara sector to Canal VD under Romulo
  console.log('\nStep 7: Updating Ana Clara sector to Canal VD under Romulo...');
  await queries.updateLeaderSector(anaClara.id, 'Canal VD', romulo.id);
  console.log('  ✓ Ana Clara now under Romulo (Canal VD)');

  // STEP 8: Update Erick Café sector to Canal VD under Romulo
  console.log('\nStep 8: Updating Erick Café sector to Canal VD under Romulo...');
  await queries.updateLeaderSector(erickCafe.id, 'Canal VD', romulo.id);
  console.log('  ✓ Erick Café now under Romulo (Canal VD)');

  console.log('\n=== Migration Complete ===\n');

  // Show final state
  const updatedEmployees = await queries.getAllEmployees();

  console.log('=== Final Teams ===\n');

  const joaoFinal = updatedEmployees.filter(e => e.leader_id === joaoAntonio.id);
  console.log(`Joao Antonio: ${joaoFinal.length} employees`);
  joaoFinal.forEach(e => console.log(`  - ${e.name}`));

  const anaClaraFinal = updatedEmployees.filter(e => e.leader_id === anaClara.id);
  console.log(`\nAna Clara: ${anaClaraFinal.length} employees`);
  anaClaraFinal.forEach(e => console.log(`  - ${e.name}`));

  const erickFinal = updatedEmployees.filter(e => e.leader_id === erickCafe.id);
  console.log(`\nErick Café: ${erickFinal.length} employees`);
  erickFinal.forEach(e => console.log(`  - ${e.name}`));

  const mariaTacianeFinal = updatedEmployees.filter(e => e.leader_id === mariaTaciane.id);
  console.log(`\nMaria Taciane: ${mariaTacianeFinal.length} employees`);
  mariaTacianeFinal.forEach(e => console.log(`  - ${e.name}`));

  const kemillyFinal = updatedEmployees.filter(e => e.leader_id === kemilly.id);
  console.log(`\nKemilly: ${kemillyFinal.length} employees`);
  kemillyFinal.forEach(e => console.log(`  - ${e.name}`));
}

main().catch(console.error);
