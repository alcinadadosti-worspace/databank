import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();
const NEW_SLACK = 'U0BGKC2GLMV';
const OLD_SLACK = 'U0BFUP30DEK';

// SOMENTE LEITURA — confere o estado do slack_id da Sabrina (122) no Firestore.
async function main() {
  const doc = await db.collection('employees').doc('122').get();
  console.log('employees/122:', JSON.stringify(doc.data()));

  console.log(`\nslack_id atual: ${doc.data()?.slack_id}`);
  console.log(`esperado (novo): ${NEW_SLACK} -> ${doc.data()?.slack_id === NEW_SLACK ? '✓ CORRETO' : '❌ DIVERGENTE'}`);

  for (const [label, sid] of [['ANTIGO/errado', OLD_SLACK], ['NOVO/correto', NEW_SLACK]] as const) {
    const emps = await db.collection('employees').where('slack_id', '==', sid).get();
    const leads = await db.collection('leaders').where('slack_id', '==', sid).get();
    console.log(`\n${label} (${sid}):`);
    console.log('  employees:', emps.docs.map(d => `[${d.data().id}] ${d.data().name}`).join(', ') || 'ninguém');
    console.log('  leaders:  ', leads.docs.map(d => `[${d.data().id}] ${d.data().name}`).join(', ') || 'ninguém');
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
