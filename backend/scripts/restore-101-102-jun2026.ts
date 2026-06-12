import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();

async function main() {
  // Pré-condições: 101/102 são os docs errados que EU criei hoje
  const d101 = (await db.collection('employees').doc('101').get()).data();
  const d102 = (await db.collection('employees').doc('102').get()).data();
  if (!d101 || !d101.name.includes('Sione')) throw new Error(`101 não é Sione: ${JSON.stringify(d101)}`);
  if (!d102 || !d102.name.includes('Samuel')) throw new Error(`102 não é Samuel: ${JSON.stringify(d102)}`);
  for (const id of ['108', '109']) {
    if ((await db.collection('employees').doc(id).get()).exists) throw new Error(`doc ${id} já existe`);
  }

  // 1. Restaurar Maria Jeane (101) — dados originais reconstituídos
  await db.collection('employees').doc('101').set({
    id: 101,
    name: 'Maria Jeane da Silva Santos',
    solides_employee_id: '6232340',
    slack_id: null, // será atualizado se encontrado no mapeamento
    leader_id: 9, // Ana Clara (confirmado por folga id=80 e justificativas)
    secondary_approver_id: null,
    created_at: '2026-03-17T00:00:00.000Z', // aproximado: primeiro registro de ponto
  });
  console.log('✓ 101 restaurado: Maria Jeane da Silva Santos (solides 6232340, leader 9)');

  // 2. Restaurar Brunna (102) — dados do script add-brunna-apprentice.ts
  await db.collection('employees').doc('102').set({
    id: 102,
    name: 'Brunna Isabelly Silva Lima',
    slack_id: 'U0ATLF85Z9U',
    leader_id: 9,
    is_apprentice: true,
    expected_daily_minutes: 240,
    works_saturday: false,
    exemption_days: [5],
    exemption_reason: 'Curso às sextas-feiras',
    secondary_approver_id: null,
    solides_employee_id: '6270908',
    created_at: '2026-04-16T00:00:00.000Z',
  });
  console.log('✓ 102 restaurado: Brunna Isabelly Silva Lima (solides 6270908, leader 9)');

  // 3. Recriar Sione e Samuel em IDs livres
  const now = new Date().toISOString();
  await db.collection('employees').doc('108').set({
    id: 108,
    name: 'Sione Barbosa da Silva',
    solides_employee_id: '6553230',
    slack_id: 'U0B8A9PLC6B',
    leader_id: 13,
    secondary_approver_id: null,
    created_at: now,
  });
  console.log('✓ 108 criado: Sione Barbosa da Silva (leader 13 Financeiro)');

  await db.collection('employees').doc('109').set({
    id: 109,
    name: 'Samuel Monteiro da Silva',
    solides_employee_id: '6555622',
    slack_id: 'U0B8TL364P3',
    leader_id: 2,
    secondary_approver_id: null,
    created_at: now,
  });
  console.log('✓ 109 criado: Samuel Monteiro da Silva (leader 2 Logistica)');

  // 4. Contador acima de todos os IDs manuais para impedir nova colisão
  await db.collection('counters').doc('employees').set({ value: 109 });
  console.log('✓ counter employees = 109');

  // 5. Auditoria
  await db.collection('audit_log').add({
    action: 'ADMIN_FIX_ID_COLLISION',
    actor: 'script:restore-101-102-jun2026',
    timestamp: now,
    details: 'Docs 101 (Maria Jeane) e 102 (Brunna) haviam sido sobrescritos por engano pelos novatos Sione/Samuel (counter desatualizado). Originais restaurados; Sione recriada como 108, Samuel como 109; counter corrigido para 109.',
  });
  console.log('✓ auditoria gravada');
  console.log('\nO sync (a cada 5 min) vai recompor automaticamente os registros de ponto de hoje.');
  process.exit(0);
}
main().catch(e => { console.error('ABORTADO:', e.message || e); process.exit(1); });
