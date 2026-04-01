import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

// Liderança/Alta gestão que não bate ponto
const NO_PUNCH_IDS = [84, 85, 86, 87, 88, 89, 90];
// ROMULO JOSE SANTOS LISBOA, MICHAELL JEAN NUNES DE CARVALHO, LEIDIANE SOUZA,
// PAULO ROGERIO SANTOS, JOSE FERNANDO DOS SANTOS SANTANA RAMOS,
// RAFAELA ALVES MENDES, ALBERTO LUIZ MARINHO BATISTA

async function main() {
  for (const id of NO_PUNCH_IDS) {
    const snap = await db.collection('employees').where('id', '==', id).limit(1).get();
    if (snap.empty) {
      console.log(`  ! ID ${id} não encontrado`);
      continue;
    }
    const data = snap.docs[0].data();
    await snap.docs[0].ref.update({ no_punch_required: true });
    console.log(`  ✓ no_punch_required = true: ${data.name} (ID ${id})`);
  }
  console.log('\nConcluído!');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
