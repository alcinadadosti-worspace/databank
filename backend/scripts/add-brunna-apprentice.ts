import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

async function main() {
  const newEmployee = {
    id: 102,
    name: 'Brunna Isabelly Silva Lima',
    slack_id: 'U0ATLF85Z9U',
    leader_id: 9,                          // Ana Clara de Matos Chagas
    is_apprentice: true,
    expected_daily_minutes: 240,           // 4h/dia (igual Yuri Castro)
    works_saturday: false,
    exemption_days: [5],                   // 5 = sexta-feira
    exemption_reason: 'Curso às sextas-feiras',
    secondary_approver_id: null,
    solides_employee_id: null,
    created_at: new Date().toISOString(),
  };

  console.log('Criando funcionária:', JSON.stringify(newEmployee, null, 2));

  await db.collection('employees').doc(String(newEmployee.id)).set(newEmployee);

  console.log(`\n✓ Brunna Isabelly Silva Lima criada (ID ${newEmployee.id})`);
  console.log(`  leader_id: 9 (Ana Clara de Matos Chagas)`);
  console.log(`  is_apprentice: true`);
  console.log(`  expected_daily_minutes: 240`);
  console.log(`  exemption_days: [5] (sexta-feira)`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
