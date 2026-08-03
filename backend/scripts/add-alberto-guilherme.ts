/**
 * Cadastra Alberto Guilherme da Silva Martins (time Alberto Marinho, leader 2).
 * Nao bate ponto: no_punch_required=true (vai para a unidade virtual "Sem Ponto"),
 * sem slack_id e sem solides_employee_id.
 * Insere tambem o vencimento de ferias da planilha: 31/03/2026 -> 02/01/2027.
 *
 * IDs: usa max(id)+1 e confere que o doc nao existe antes do .set(); ajusta o
 * counter para nao ficar atras (contador nao e confiavel neste projeto).
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

const NAME = 'Alberto Guilherme da Silva Martins';
const LEADER_ID = 2; // Alberto Luiz Marinho Batista (Logistica)
const PERIOD_1 = '2026-03-31'; // Vencto. Ferias (planilha 31/03/2026)
const PERIOD_2 = '2027-01-02'; // Limite p/ Gozo (planilha 02/01/2027)

function normalize(name: string) {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

async function nextSafeId(collection: string): Promise<number> {
  const snap = await db.collection(collection).get();
  const maxId = snap.docs.reduce((m, d) => Math.max(m, (d.data().id as number) || 0), 0);
  const next = maxId + 1;

  const docRef = db.collection(collection).doc(String(next));
  if ((await docRef.get()).exists) {
    throw new Error(`Doc ${collection}/${next} ja existe — abortando`);
  }

  // Mantem o counter no minimo em `next` para inserts futuros via getNextId
  const counterRef = db.collection('counters').doc(collection);
  await db.runTransaction(async tx => {
    const c = await tx.get(counterRef);
    const current = c.exists ? (c.data()!.value as number) : 0;
    if (current < next) tx.set(counterRef, { value: next });
  });

  return next;
}

async function main() {
  const now = new Date().toISOString();

  // Nao duplicar
  const empSnap = await db.collection('employees').get();
  const dup = empSnap.docs.find(d => normalize(d.data().name) === normalize(NAME));
  if (dup) {
    console.error(`Ja existe: emp ${dup.data().id} — ${dup.data().name}. Abortando.`);
    process.exit(1);
  }

  const empId = await nextSafeId('employees');
  await db.collection('employees').doc(String(empId)).set({
    id: empId,
    name: NAME,
    slack_id: null,
    leader_id: LEADER_ID,
    secondary_approver_id: null,
    solides_employee_id: null,
    is_apprentice: false,
    expected_daily_minutes: 480,
    no_punch_required: true,
    works_saturday: true,
    created_at: now,
  });
  console.log(`✓ Employee criado: ${NAME} (ID ${empId}, leader ${LEADER_ID}, no_punch_required=true)`);

  const existing = await db.collection('vacation_schedules').where('employee_id', '==', empId).limit(1).get();
  if (!existing.empty) {
    console.log('Vencimento ja existia — nada a inserir.');
    process.exit(0);
  }

  const vsId = await nextSafeId('vacation_schedules');
  await db.collection('vacation_schedules').doc(String(vsId)).set({
    id: vsId,
    employee_id: empId,
    period_1_date: PERIOD_1,
    period_2_date: PERIOD_2,
    notes: null,
    created_at: now,
    updated_at: now,
  });
  console.log(`✓ Vencimento inserido (sched ${vsId}): ${PERIOD_1} → ${PERIOD_2}`);

  process.exit(0);
}

main().catch(e => { console.error('Erro:', e); process.exit(1); });
