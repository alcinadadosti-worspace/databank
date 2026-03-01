import { getDb } from './src/models/database';

async function fixDuplicate() {
  const db = getDb();

  // Buscar todas as Thayane
  const thayanes = await db.collection('employees').where('name', '==', 'Thayane Mayara dos Santos').get();

  console.log('Registros de Thayane Mayara encontrados: ' + thayanes.size);

  if (thayanes.size > 1) {
    // Manter apenas o primeiro, remover os outros
    const docs = thayanes.docs;
    for (let i = 1; i < docs.length; i++) {
      console.log('Removendo duplicata ID: ' + docs[i].data().id);
      await docs[i].ref.delete();
    }
    console.log('✅ Duplicata removida');
  }

  // Verificar resultado
  const underSuzana = await db.collection('employees').where('leader_id', '==', 15).get();
  console.log('\nColaboradores sob Suzana agora:');
  underSuzana.forEach(doc => {
    console.log('  - ' + doc.data().name);
  });
}

fixDuplicate().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
