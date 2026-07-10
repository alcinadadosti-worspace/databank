import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

// Maria Taciane Pereira Barbosa -> leader_id 11 (lojas Coruripe, Penedo e Teotonio Vilela)
// Kemilly Rafaelly Souza Silva  -> leader_id 10
//
// Objetivo: os alertas do time da Maria Taciane (as 3 lojas acima) deixam de ir
// para ela e passam a ir para a Kemilly. Usamos cover_leader_id, que só reroteia
// os alertas de Slack — leader_id, time e acesso web da Maria Taciane continuam iguais.
const TACIANE_ID = 11;
const KEMILLY_ID = 10;

async function main() {
  const ref = db.collection('leaders').doc(String(TACIANE_ID));
  const snap = await ref.get();
  if (!snap.exists) {
    console.error(`Leader ${TACIANE_ID} não encontrado`);
    process.exit(1);
  }
  const data = snap.data()!;

  // Segurança: confirmar que o doc 11 é mesmo a Maria Taciane
  if (!(data.name ?? '').toLowerCase().includes('taciane')) {
    console.error(`Segurança: leaders/${TACIANE_ID} é "${data.name}", não parece ser a Maria Taciane. Abortando.`);
    process.exit(1);
  }

  // Confirmar que a Kemilly (10) existe e tem slack_id (senão o alerta não chega a ninguém)
  const kemilly = (await db.collection('leaders').doc(String(KEMILLY_ID)).get()).data();
  if (!kemilly) {
    console.error(`Leader ${KEMILLY_ID} (Kemilly) não encontrado. Abortando.`);
    process.exit(1);
  }
  if (!kemilly.slack_id) {
    console.error(`Kemilly (${KEMILLY_ID}) está sem slack_id — os alertas não chegariam. Abortando.`);
    process.exit(1);
  }

  console.log(`Antes: ${data.name} (slack_id=${data.slack_id}, cover_leader_id=${data.cover_leader_id ?? 'nenhum'})`);
  console.log(`Cobertura destino: ${kemilly.name} (leader_id=${KEMILLY_ID}, slack_id=${kemilly.slack_id})`);

  if (data.cover_leader_id === KEMILLY_ID) {
    console.log('Nada a fazer: cover_leader_id já aponta para a Kemilly.');
    process.exit(0);
  }

  await ref.update({ cover_leader_id: KEMILLY_ID });

  const after = (await ref.get()).data()!;
  console.log(`Depois: ${after.name} (slack_id=${after.slack_id}, cover_leader_id=${after.cover_leader_id})`);
  console.log(`\n✓ Alertas do time da Maria Taciane (Coruripe, Penedo e Teotonio Vilela) agora vão para a Kemilly (leader_id=${KEMILLY_ID}).`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
