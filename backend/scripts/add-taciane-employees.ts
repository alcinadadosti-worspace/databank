import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

// Maria Taciane Pereira Barbosa leader_id=11
const LEADER_ID = 11;

const newEmployees = [
  // Loja Penedo
  { id: 103, name: 'Maria Fernanda Gomes Vieira', slack_id: 'U0ASUE1GNUA' },
  { id: 104, name: 'Joanna Queiroz',              slack_id: 'U0ARN2C0YLT' },
  // Loja Teotonio Vilela
  { id: 105, name: 'Josenildo Alves',             slack_id: 'U0ASY08QHTN' },
  { id: 106, name: 'Shayane Ferreira',            slack_id: 'U0AT1KKLWNS' },
];

async function main() {
  for (const emp of newEmployees) {
    const data = {
      id: emp.id,
      name: emp.name,
      slack_id: emp.slack_id,
      leader_id: LEADER_ID,
      secondary_approver_id: null,
      solides_employee_id: null,
      created_at: new Date().toISOString(),
    };
    await db.collection('employees').doc(String(emp.id)).set(data);
    console.log(`✓ ${emp.name} criado (ID ${emp.id}, leader_id=${LEADER_ID})`);
  }
  console.log('\nDone.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
