import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();
const COMMIT = process.argv.includes('--commit');

// Loja Penedo passa de vez para a Mariane (leader 12) — 2026-10-26
//  - Até aqui o time era da Taciane (leader_id=11) e a Mariane via a loja só como
//    gestora secundária (secondary_approver_id=12) + alertas (alert_cover_leader_id=12).
//    Por isso ela não aparecia nos filtros de gestor do admin, que usam o leader_id.
//  - Agora leader_id=12 e os dois desvios são limpos (redundantes com ela como principal).
//  - Precisa do deploy que renomeia a unidade do leader 12 de "Loja Digital" p/ "Loja Penedo".
const TACIANE_ID = 11;
const MARIANE_ID = 12;
const PENEDO: Record<number, string> = {
  56: 'Deise Gislaine Silva vitor',
  103: 'Maria Fernanda Gomes Vieira',
  64: 'Anny Karoline Andrade Santos',
};

async function main() {
  console.log(COMMIT ? '*** MODO COMMIT — vai gravar no Firestore ***' : '*** DRY-RUN (use --commit para gravar) ***');
  console.log(`Ação: Loja Penedo leader_id ${TACIANE_ID} → ${MARIANE_ID} (Mariane)\n`);

  let abort = false;
  const mariane = (await db.collection('leaders').doc(String(MARIANE_ID)).get()).data();
  if (!mariane) { console.log(`❌ leaders/${MARIANE_ID} não existe`); abort = true; }
  else {
    if (!mariane.slack_id) { console.log(`❌ ${mariane.name} está sem slack_id — alerta não chegaria`); abort = true; }
    if (mariane.cover_leader_id) console.log(`⚠ leaders/${MARIANE_ID} tem cover_leader_id=${mariane.cover_leader_id} — alertas iriam p/ outra pessoa`);
    console.log(`Nova gestora: ${mariane.name} (leader ${MARIANE_ID}, slack ${mariane.slack_id ?? '-'})`);
  }

  for (const [id, name] of Object.entries(PENEDO)) {
    const x = (await db.collection('employees').doc(id).get()).data();
    if (!x) { console.log(`❌ employees/${id} não existe`); abort = true; continue; }
    if (x.name !== name) { console.log(`❌ employees/${id} é "${x.name}", esperado "${name}"`); abort = true; }
    if (x.leader_id !== TACIANE_ID && x.leader_id !== MARIANE_ID) {
      console.log(`❌ employees/${id} (${name}) está com leader_id=${x.leader_id}, esperado ${TACIANE_ID}`); abort = true;
    }
    console.log(`  employees/${id} ${x.name}:`);
    console.log(`    leader_id              ${x.leader_id} → ${MARIANE_ID}`);
    console.log(`    secondary_approver_id  ${x.secondary_approver_id ?? '(vazio)'} → (vazio)`);
    console.log(`    alert_cover_leader_id  ${x.alert_cover_leader_id ?? '(vazio)'} → (removido)`);
  }

  // Contexto: quem mais aponta p/ a Mariane, e se os nomes antigos da lista da Penedo ainda existem
  const emps = (await db.collection('employees').get()).docs.map(d => d.data() as any);
  const others = emps.filter(e => !(e.id in PENEDO) && (e.leader_id === MARIANE_ID || e.secondary_approver_id === MARIANE_ID || e.alert_cover_leader_id === MARIANE_ID));
  console.log(`\nOutros colaboradores ligados ao leader ${MARIANE_ID}: ${others.length}`);
  others.forEach(e => console.log(`  [${e.id}] ${e.name} leader=${e.leader_id} secundário=${e.secondary_approver_id ?? '-'} alert_cover=${e.alert_cover_leader_id ?? '-'}`));
  for (const term of ['cristielle', 'samyra']) {
    const found = emps.filter(e => String(e.name ?? '').toLowerCase().includes(term));
    console.log(`Busca "${term}": ${found.length ? found.map(e => `[${e.id}] ${e.name} leader=${e.leader_id}`).join('; ') : 'nenhum'}`);
  }

  if (abort) { console.log('\nProblema detectado. Nada foi gravado.'); process.exit(1); }

  if (!COMMIT) { console.log('\nDRY-RUN: nada gravado. Rode novamente com --commit.'); process.exit(0); }

  const batch = db.batch();
  for (const id of Object.keys(PENEDO)) {
    batch.update(db.collection('employees').doc(id), {
      leader_id: MARIANE_ID,
      secondary_approver_id: null,
      alert_cover_leader_id: FieldValue.delete(),
    });
  }
  await batch.commit();
  console.log('\n✓ Gravado');

  for (const id of Object.keys(PENEDO)) {
    const x = (await db.collection('employees').doc(id).get()).data()!;
    console.log(`  employees/${id} ${x.name} → leader_id=${x.leader_id}, secundário=${x.secondary_approver_id ?? '(vazio)'}, alert_cover=${x.alert_cover_leader_id ?? '(vazio)'}`);
  }
  console.log('\nCache de cadastro leva até 30 min p/ refletir (o restart do deploy limpa na hora).');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
