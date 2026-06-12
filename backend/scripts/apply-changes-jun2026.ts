import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

const TODAY = new Date().toISOString().split('T')[0];

async function getNextId(collection: string): Promise<number> {
  const ref = db.collection('counters').doc(collection);
  return db.runTransaction(async tx => {
    const doc = await tx.get(ref);
    const next = (doc.exists ? (doc.data()!.value as number) : 0) + 1;
    tx.set(ref, { value: next });
    return next;
  });
}

// Pré-condição: doc existe e o nome contém o esperado. Aborta se divergir.
async function expectDoc(col: string, docId: string, nameContains: string) {
  const doc = await db.collection(col).doc(docId).get();
  if (!doc.exists) throw new Error(`PRÉ-CONDIÇÃO FALHOU: ${col}/${docId} não existe`);
  const name = (doc.data()!.name || '').toLowerCase();
  if (!name.includes(nameContains.toLowerCase())) {
    throw new Error(`PRÉ-CONDIÇÃO FALHOU: ${col}/${docId} esperava nome contendo "${nameContains}", encontrado "${doc.data()!.name}"`);
  }
  return doc.data()!;
}

async function main() {
  console.log('── 1. Verificando pré-condições ──');
  await expectDoc('leaders', '13', 'michaell');
  await expectDoc('employees', '42', 'maria victoria');
  await expectDoc('employees', '61', 'thamirys');
  await expectDoc('employees', '85', 'michaell');
  await expectDoc('employees', '98', 'larissa alexia');
  await expectDoc('employees', '65', 'tomás azevedo');
  await expectDoc('users', '48', 'maria victoria');
  await expectDoc('users', '65', 'thamirys');
  await expectDoc('users', '78', 'michaell');

  // Novatos não podem já existir (idempotência)
  for (const solidesId of ['6553230', '6555622']) {
    const dup = await db.collection('employees').where('solides_employee_id', '==', solidesId).limit(1).get();
    if (!dup.empty) throw new Error(`PRÉ-CONDIÇÃO FALHOU: já existe employee com solides_employee_id=${solidesId}`);
  }
  console.log('  ✓ todas as pré-condições OK');

  console.log('\n── 2. Líder 13: Michaell → Tomás Azevedo Santos ──');
  await db.collection('leaders').doc('13').update({
    name: 'Tomás Azevedo Santos',
    name_normalized: 'tomás azevedo santos',
    slack_id: 'U081ZP68CA1', // slack do Tomás (employee id=65)
  });
  console.log('  ✓ leader 13 atualizado (time Financeiro/Administrativo mantém leader_id=13)');

  console.log('\n── 3. Inserindo novatos ──');
  const now = new Date().toISOString();
  const sioneId = await getNextId('employees');
  await db.collection('employees').doc(String(sioneId)).set({
    id: sioneId,
    name: 'Sione Barbosa da Silva',
    solides_employee_id: '6553230',
    slack_id: 'U0B8A9PLC6B',
    leader_id: 13, // Financeiro/Administrativo (Tomás)
    secondary_approver_id: null,
    created_at: now,
  });
  console.log(`  ✓ Sione Barbosa da Silva criada (id=${sioneId}, leader_id=13 Financeiro)`);

  const samuelId = await getNextId('employees');
  await db.collection('employees').doc(String(samuelId)).set({
    id: samuelId,
    name: 'Samuel Monteiro da Silva',
    solides_employee_id: '6555622',
    slack_id: 'U0B8TL364P3',
    leader_id: 2, // Alberto — unidade virtual Logistica Palmeira dos Indios (via lista no código)
    secondary_approver_id: null,
    created_at: now,
  });
  console.log(`  ✓ Samuel Monteiro da Silva criado (id=${samuelId}, leader_id=2 Logistica → unidade Palmeira dos Indios)`);

  console.log('\n── 4. Removendo demitidos ──');
  const removals: Array<[string, string, string]> = [
    ['employees', '42', 'Maria Victoria Souza Araujo Ferro'],
    ['employees', '61', 'Thamirys Silvestrini Morales'],
    ['employees', '98', 'Larissa Alexia da Silva Souza'],
    ['employees', '85', 'Michaell (registro de funcionário)'],
    ['users', '48', 'Maria Victoria (login)'],
    ['users', '65', 'Thamirys (login)'],
    ['users', '78', 'Michaell (login gestor)'],
    ['vacation_schedules', '14', 'vencimento férias Maria Victoria'],
    ['vacation_schedules', '76', 'vencimento férias Thamirys'],
  ];
  for (const [col, docId, label] of removals) {
    await db.collection(col).doc(docId).delete();
    console.log(`  ✓ deletado ${col}/${docId} (${label})`);
  }

  // Folga da Thamirys: só remove se for futura
  const folga = await db.collection('folgas').doc('53').get();
  if (folga.exists) {
    const fdate = folga.data()!.date;
    if (fdate >= TODAY) {
      await db.collection('folgas').doc('53').delete();
      console.log(`  ✓ folga futura da Thamirys (${fdate}) deletada`);
    } else {
      console.log(`  • folga passada da Thamirys (${fdate}) mantida como histórico`);
    }
  }

  console.log('\n── 5. Registro de auditoria ──');
  await db.collection('audit_log').add({
    action: 'ADMIN_BATCH_UPDATE',
    actor: 'script:apply-changes-jun2026',
    timestamp: now,
    details: 'Demissões: Thamirys (61), Larissa Alexia (98), Maria Victoria (42), Michaell (85 + leader 13). ' +
      `Líder 13 agora é Tomás Azevedo Santos. Admissões: Sione Barbosa (${sioneId}, Financeiro), Samuel Monteiro (${samuelId}, Logistica Palmeira).`,
  });
  console.log('  ✓ auditoria gravada');

  console.log('\nConcluído com sucesso.');
  process.exit(0);
}

main().catch(e => { console.error('\nABORTADO:', e.message || e); process.exit(1); });
