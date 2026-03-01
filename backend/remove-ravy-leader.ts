import { getDb } from './src/models/database';

async function fix() {
  const db = getDb();

  console.log('=== REMOVENDO RAVY THIAGO COMO GESTOR ===\n');

  // 1. Verificar se tem colaboradores sob Ravy (ID 16)
  const underRavy = await db.collection('employees').where('leader_id', '==', 16).get();
  console.log('Colaboradores sob Ravy (ID 16): ' + underRavy.size);

  // 2. Mover colaboradores de Ravy para Suzana (ID 15)
  for (const doc of underRavy.docs) {
    const data = doc.data();
    console.log('  Movendo ' + data.name + ' para Suzana (ID 15)');
    await doc.ref.update({ leader_id: 15 });
  }

  // 3. Remover Ravy da lista de gestores
  const ravyLeader = await db.collection('leaders').where('id', '==', 16).get();
  if (!ravyLeader.empty) {
    await ravyLeader.docs[0].ref.delete();
    console.log('\n✅ Ravy Thiago removido da lista de gestores');
  }

  // 4. Verificar Suzana agora
  const underSuzana = await db.collection('employees').where('leader_id', '==', 15).get();
  console.log('\nColaboradores sob Suzana (ID 15) agora:');
  underSuzana.forEach(doc => {
    console.log('  - ' + doc.data().name);
  });

  console.log('\nConcluído!');
}

fix().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
