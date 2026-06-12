import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const SLACK_ID = 'U0AP3LJ355L';

async function main() {
  // Sanidade: nenhum outro employee/leader pode ter esse slack_id
  const dupEmp = await db.collection('employees').where('slack_id', '==', SLACK_ID).get();
  if (!dupEmp.empty) throw new Error(`slack_id já em uso por employee: ${dupEmp.docs.map(d => d.data().name).join(', ')}`);
  const dupLeader = await db.collection('leaders').where('slack_id', '==', SLACK_ID).get();
  if (!dupLeader.empty) throw new Error(`slack_id já em uso por leader: ${dupLeader.docs.map(d => d.data().name).join(', ')}`);

  const doc = await db.collection('employees').doc('101').get();
  if (!doc.exists || !doc.data()!.name.includes('Jeane')) throw new Error(`doc 101 inesperado: ${JSON.stringify(doc.data())}`);

  await db.collection('employees').doc('101').update({ slack_id: SLACK_ID });
  console.log(`✓ Maria Jeane da Silva Santos (101): slack_id = ${SLACK_ID}`);

  await db.collection('audit_log').add({
    action: 'ADMIN_UPDATE_SLACK_ID',
    actor: 'script:set-jeane-slack-jun2026',
    timestamp: new Date().toISOString(),
    details: `Maria Jeane da Silva Santos (101): slack_id recadastrado (${SLACK_ID}) após perda na colisão de IDs.`,
  });
  console.log('✓ auditoria gravada');
  process.exit(0);
}
main().catch(e => { console.error('ABORTADO:', e.message || e); process.exit(1); });
