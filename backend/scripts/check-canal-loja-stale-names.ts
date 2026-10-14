import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

// SOMENTE LEITURA — nomes das listas de loja do queries.ts que não batem com nenhum employee
async function main() {
  const emps = (await getFirestore().collection('employees').get()).docs.map(d => d.data());
  for (const q of ['gabrielle', 'cristielle', 'samyra', 'tatiane basto', 'loja digital']) {
    const hits = emps.filter(e => (e.name ?? '').toLowerCase().includes(q));
    console.log(q, '→', hits.length ? hits.map(e => `${e.id} ${e.name} leader=${e.leader_id}`).join('; ') : 'nenhum');
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
