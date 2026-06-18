import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();
const COMMIT = process.argv.includes('--commit');

// Valesca Meirelle Bezerra Vitória: Loja Palmeira (Kemilly, leader_id=10) -> VD Palmeira dos Indios (leader_id=4)
const TARGET_LEADER_ID = 4;

async function main() {
  console.log(COMMIT ? '*** MODO COMMIT — vai gravar no Firestore ***\n' : '*** DRY-RUN (use --commit para gravar) ***\n');

  const [empSnap, ledSnap] = await Promise.all([
    db.collection('employees').get(),
    db.collection('leaders').get(),
  ]);

  const leaders = new Map<number, any>();
  ledSnap.docs.forEach(d => { const x = d.data(); leaders.set(x.id, x); });

  const valescaDoc = empSnap.docs.find(d => (d.data().name?.toLowerCase() ?? '').includes('valesca'));
  if (!valescaDoc) { console.error('Valesca não encontrada'); process.exit(1); }

  const v = valescaDoc.data();
  console.log('Valesca encontrada:');
  console.log(JSON.stringify(v, null, 2));
  console.log(`\nleader atual: ${v.leader_id} -> ${leaders.get(v.leader_id)?.name ?? '?'} (setor: ${leaders.get(v.leader_id)?.sector ?? '?'})`);
  console.log(`leader alvo:  ${TARGET_LEADER_ID} -> ${leaders.get(TARGET_LEADER_ID)?.name ?? '?'} (setor: ${leaders.get(TARGET_LEADER_ID)?.sector ?? '?'})`);

  if (v.leader_id === TARGET_LEADER_ID) {
    console.log('\nJá está no leader alvo. Nada a fazer.');
    process.exit(0);
  }

  if (!COMMIT) { console.log('\nDRY-RUN: nada gravado. Rode novamente com --commit.'); process.exit(0); }

  await db.collection('employees').doc(valescaDoc.id).update({ leader_id: TARGET_LEADER_ID });
  console.log(`\n✓ ${v.name} (id ${v.id}) leader_id ${v.leader_id} -> ${TARGET_LEADER_ID}`);

  const after = await db.collection('employees').doc(valescaDoc.id).get();
  console.log('Pós-gravação:', JSON.stringify(after.data()));
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
