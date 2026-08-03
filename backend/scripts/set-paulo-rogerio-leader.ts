/**
 * Paulo Rogerio Santos (emp 87) estava com leader_id null (veio do lote
 * insert-no-punch.ts, que cadastrou os sem-ponto sem gestor). Por isso aparecia
 * "sem gestor" na tela de Ferias/Vencimentos.
 *
 * Define leader_id = 2 (Alberto Luiz Marinho Batista, Logistica).
 * Mantem no_punch_required = true: ele continua fora do radar de ponto
 * (sem lembretes, sem alertas de sem-registro/atraso) e segue no card "Sem Ponto".
 */
import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'path';
import fs from 'fs';

if (getApps().length === 0) {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (b64) {
    initializeApp({ credential: cert(JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))) });
  } else {
    initializeApp({ credential: cert(JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'firebase-key.json'), 'utf8'))) });
  }
}
const db = getFirestore();

const EMPLOYEE_ID = 87;
const LEADER_ID = 2;

async function main() {
  const ref = db.collection('employees').doc(String(EMPLOYEE_ID));
  const doc = await ref.get();
  if (!doc.exists) {
    console.error(`Employee ${EMPLOYEE_ID} nao existe. Abortando.`);
    process.exit(1);
  }

  const data = doc.data()!;
  if (!String(data.name).toLowerCase().includes('paulo rogerio')) {
    console.error(`Employee ${EMPLOYEE_ID} e "${data.name}", nao Paulo Rogerio. Abortando.`);
    process.exit(1);
  }

  const leader = await db.collection('leaders').doc(String(LEADER_ID)).get();
  if (!leader.exists) {
    console.error(`Leader ${LEADER_ID} nao existe. Abortando.`);
    process.exit(1);
  }

  console.log(`Antes:  ${data.name} | leader_id: ${data.leader_id} | no_punch_required: ${data.no_punch_required}`);

  await ref.update({ leader_id: LEADER_ID });

  const after = (await ref.get()).data()!;
  console.log(`Depois: ${after.name} | leader_id: ${after.leader_id} (${leader.data()!.name}) | no_punch_required: ${after.no_punch_required}`);
  console.log('✓ Gestor definido. Continua sem ponto: nenhum alerta novo e gerado.');
  process.exit(0);
}

main().catch(e => { console.error('Erro:', e); process.exit(1); });
