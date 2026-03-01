import { getDb } from './src/models/database';

async function fixHierarchy() {
  const db = getDb();

  console.log('=== CORRIGINDO HIERARQUIA ===\n');

  // 1. Mover Ana Clara (employee) para Romulo (leader_id = 1)
  const anaClara = await db.collection('employees').where('name', '==', 'Ana Clara de Matos Chagas').get();
  if (!anaClara.empty) {
    const doc = anaClara.docs[0];
    await doc.ref.update({ leader_id: 1 });
    console.log('✅ Ana Clara de Matos Chagas -> Romulo Jose Santos Lisboa (ID 1)');
  }

  // 2. Mover Erick Café (employee) para Romulo (leader_id = 1)
  const erick = await db.collection('employees').where('name', '==', 'Erick Café Santos Júnior').get();
  if (!erick.empty) {
    const doc = erick.docs[0];
    await doc.ref.update({ leader_id: 1 });
    console.log('✅ Erick Café Santos Júnior -> Romulo Jose Santos Lisboa (ID 1)');
  }

  // 3. Remover Leidiane duplicada (ID 8)
  const leidianeDup = await db.collection('leaders').where('id', '==', 8).get();
  if (!leidianeDup.empty) {
    const doc = leidianeDup.docs[0];
    await doc.ref.delete();
    console.log('✅ Removido: Leidiane Souza duplicada (ID 8)');
  }

  // 4. Verificar que Leidiane (ID 6) tem apenas Kemilly, Maria Taciane, Mariane
  // Primeiro, vamos ver quem está sob Leidiane atualmente
  const underLeidiane = await db.collection('employees').where('leader_id', '==', 6).get();
  console.log('\nColaboradores atuais sob Leidiane (ID 6):');
  underLeidiane.forEach(doc => {
    const data = doc.data();
    console.log('  - ' + data.name);
  });

  console.log('\n=== HIERARQUIA ATUALIZADA ===\n');

  // Mostrar nova hierarquia
  const leadersSnap = await db.collection('leaders').orderBy('id').get();
  const leaders: any[] = [];
  leadersSnap.forEach(doc => leaders.push(doc.data()));

  const employeesSnap = await db.collection('employees').get();
  const employees: any[] = [];
  employeesSnap.forEach(doc => employees.push(doc.data()));

  for (const l of leaders) {
    const emps = employees.filter(e => e.leader_id === l.id);
    if (emps.length > 0 || l.id <= 6) {
      console.log(`[${l.name}] (ID ${l.id}) - ${emps.length} colaboradores`);
      for (const e of emps) {
        console.log(`  - ${e.name}`);
      }
      console.log('');
    }
  }
}

fixHierarchy().then(() => {
  console.log('Concluído!');
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
