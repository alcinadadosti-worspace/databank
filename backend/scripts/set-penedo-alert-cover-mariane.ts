import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();
const COMMIT = process.argv.includes('--commit');
const CLEAR = process.argv.includes('--clear');

// Loja Penedo (time da Maria Taciane, leader 11) → alertas para a Mariane (leader 12) — 2026-10-09
//  - Só enquanto a Taciane estiver de licença. O resto do time 11 continua indo p/ Kemilly
//    via cover_leader_id=10 no leader 11.
//  - Usa employees.alert_cover_leader_id (só roteia alerta do Slack; leader_id, painel e
//    aprovações continuam com a Taciane). Precisa do deploy que introduziu esse campo.
//  - Quando a Taciane voltar: rodar com --clear --commit (e limpar o cover_leader_id do leader 11).
const TACIANE_ID = 11;
const MARIANE_ID = 12;
const PENEDO: Record<number, string> = {
  56: 'Deise Gislaine Silva vitor',
  103: 'Maria Fernanda Gomes Vieira',
  64: 'Anny Karoline Andrade Santos',
};

async function main() {
  console.log(COMMIT ? '*** MODO COMMIT — vai gravar no Firestore ***' : '*** DRY-RUN (use --commit para gravar) ***');
  console.log(CLEAR ? 'Ação: REMOVER desvio de alerta (Taciane voltou)\n' : `Ação: alertas da Loja Penedo → Mariane (leader ${MARIANE_ID})\n`);

  let abort = false;
  const mariane = (await db.collection('leaders').doc(String(MARIANE_ID)).get()).data();
  if (!CLEAR) {
    if (!mariane) { console.log(`❌ leaders/${MARIANE_ID} não existe`); abort = true; }
    else if (!mariane.slack_id) { console.log(`❌ ${mariane.name} está sem slack_id — alerta não chegaria`); abort = true; }
    else console.log(`Destino: ${mariane.name} (leader ${MARIANE_ID}, slack ${mariane.slack_id})`);
  }
  for (const [id, name] of Object.entries(PENEDO)) {
    const x = (await db.collection('employees').doc(id).get()).data();
    if (!x) { console.log(`❌ employees/${id} não existe`); abort = true; continue; }
    if (x.name !== name) { console.log(`❌ employees/${id} é "${x.name}", esperado "${name}"`); abort = true; }
    if (x.leader_id !== TACIANE_ID) { console.log(`❌ employees/${id} (${name}) está com leader_id=${x.leader_id}, esperado ${TACIANE_ID}`); abort = true; }
    const target = CLEAR ? '(removido)' : MARIANE_ID;
    console.log(`  employees/${id} ${x.name}: alert_cover_leader_id ${x.alert_cover_leader_id ?? '(vazio)'} → ${target}`);
  }
  if (abort) { console.log('\nProblema detectado. Nada foi gravado.'); process.exit(1); }

  if (!COMMIT) { console.log('\nDRY-RUN: nada gravado. Rode novamente com --commit.'); process.exit(0); }

  const batch = db.batch();
  for (const id of Object.keys(PENEDO)) {
    batch.update(db.collection('employees').doc(id), {
      alert_cover_leader_id: CLEAR ? FieldValue.delete() : MARIANE_ID,
    });
  }
  await batch.commit();
  console.log('\n✓ Gravado');

  for (const id of Object.keys(PENEDO)) {
    const x = (await db.collection('employees').doc(id).get()).data()!;
    console.log(`  employees/${id} ${x.name} → leader_id=${x.leader_id}, alert_cover_leader_id=${x.alert_cover_leader_id ?? '(vazio)'}`);
  }
  console.log('\nCache de cadastro leva até 30 min p/ refletir.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
