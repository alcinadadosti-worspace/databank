import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

// Kemilly Rafaelly Souza Silva (Loja São Sebastião) leader_id=10
const LEADER_ID = 10;

const employee = {
  id: 107,
  name: 'Nayara Soares Kimura',
  slack_id: 'U0B1D2NM47M',
  solides_employee_id: '6407760',
};

async function main() {
  const data = {
    id: employee.id,
    name: employee.name,
    slack_id: employee.slack_id,
    leader_id: LEADER_ID,
    secondary_approver_id: null,
    solides_employee_id: employee.solides_employee_id,
    created_at: new Date().toISOString(),
  };
  await db.collection('employees').doc(String(employee.id)).set(data);
  console.log(`✓ ${employee.name} criado (ID ${employee.id}, leader_id=${LEADER_ID}, solides=${employee.solides_employee_id})`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
