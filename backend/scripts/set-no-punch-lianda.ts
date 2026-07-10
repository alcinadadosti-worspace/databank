import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

// Lianda Melinda Santos Calixto - employee id 75 (líder: Suzana Martins Tavares).
// Objetivo: tirar Lianda do "radar de ponto" -> a app deixa de enviar alertas
// para ela E deixa de informar a Suzana sobre ela.
//   - manager-daily-alert (sem_registro/ajuste): já respeita no_punch_required
//   - punch-reminders: já respeita no_punch_required
//   - sync-punches (alerta de atraso/hora extra): passa a respeitar a flag
//   - resumo diário/semanal do gestor: passa a filtrar no_punch_required
// Os pontos continuam sendo salvos (banco de horas segue correto), só o Slack silencia.
async function main() {
  const ref = db.collection('employees').doc('75');
  const snap = await ref.get();
  const data = snap.data();

  if (!data) {
    console.error('Lianda (id=75) não encontrada.');
    process.exit(1);
  }

  const name: string = data.name ?? '';
  if (!name.toLowerCase().includes('lianda')) {
    console.error(`Segurança: employees/75 é "${name}", não parece ser a Lianda. Abortando.`);
    process.exit(1);
  }

  console.log(`Antes: ${name} (ID 75, leader_id ${data.leader_id}) no_punch_required=${data.no_punch_required}`);

  if (data.no_punch_required === true) {
    console.log('Nada a fazer: no_punch_required já é true.');
    process.exit(0);
  }

  await ref.update({ no_punch_required: true });

  const after = (await ref.get()).data();
  console.log(`Depois: ${after?.name} (ID 75) no_punch_required=${after?.no_punch_required}`);
  console.log('✓ Lianda fora do radar de ponto: sem alertas para ela e sem avisos para a Suzana.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
