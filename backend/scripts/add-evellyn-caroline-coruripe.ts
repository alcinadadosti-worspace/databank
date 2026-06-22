import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();
const COMMIT = process.argv.includes('--commit');

// Cadastro Loja Coruripe (leader_id=11, Maria Taciane Pereira Barbosa) — 2026-06-22
//  - Loja Coruripe é unidade VIRTUAL: além de gravar aqui, os nomes (lowercase)
//    foram adicionados a LOJA_CORURIPE_EMPLOYEES em src/models/queries.ts.
//    SEM esse array + deploy do backend, o colaborador não aparece em nenhuma unidade.
//  - Jornada padrão de loja: 480 min Seg-Sex; sábado via getSaturdayMinutes (240).
//  - solides_employee_id obtido pela API Sólides (find-all por nome).
const newEmployees = [
  {
    id: 112,
    name: 'Evellyn Vitória Nunes Santos',
    slack_id: 'U0BBWRCFVM0',
    leader_id: 11,
    secondary_approver_id: null,
    solides_employee_id: '6632576',
    is_apprentice: false,
    expected_daily_minutes: 480, // 8h Seg-Sex; sábado usa getSaturdayMinutes (240)
    no_punch_required: false,
    works_saturday: true,
  },
  {
    id: 113,
    name: 'Caroline Leite dos Santos',
    slack_id: 'U0BBSVDGNP5',
    leader_id: 11,
    secondary_approver_id: null,
    solides_employee_id: '6632561',
    is_apprentice: false,
    expected_daily_minutes: 480, // 8h Seg-Sex; sábado usa getSaturdayMinutes (240)
    no_punch_required: false,
    works_saturday: true,
  },
];

async function main() {
  console.log(COMMIT ? '*** MODO COMMIT — vai gravar no Firestore ***\n' : '*** DRY-RUN (use --commit para gravar) ***\n');

  // 1) Checagem de segurança: nenhum doc/id/slack/solides pode colidir
  const snap = await db.collection('employees').get();
  let maxId = 0;
  const slackInUse = new Map<string, string>();
  const solidesInUse = new Map<string, string>();
  const nameInUse = new Map<string, string>();
  snap.docs.forEach(d => {
    const data = d.data();
    if (typeof data.id === 'number' && data.id > maxId) maxId = data.id;
    if (data.slack_id) slackInUse.set(data.slack_id, `${d.id}:${data.name}`);
    if (data.solides_employee_id) solidesInUse.set(String(data.solides_employee_id), `${d.id}:${data.name}`);
    if (data.name) nameInUse.set(String(data.name).toLowerCase(), `${d.id}:${data.name}`);
  });

  let abort = false;
  for (const emp of newEmployees) {
    const docRef = db.collection('employees').doc(String(emp.id));
    const existing = await docRef.get();
    if (existing.exists) {
      console.log(`❌ doc ${emp.id} JÁ EXISTE: ${JSON.stringify(existing.data())} — abortando`);
      abort = true;
    }
    if (slackInUse.has(emp.slack_id)) {
      console.log(`❌ slack_id ${emp.slack_id} já usado por ${slackInUse.get(emp.slack_id)} — abortando`);
      abort = true;
    }
    if (solidesInUse.has(emp.solides_employee_id)) {
      console.log(`❌ solides_employee_id ${emp.solides_employee_id} já usado por ${solidesInUse.get(emp.solides_employee_id)} — abortando`);
      abort = true;
    }
    if (nameInUse.has(emp.name.toLowerCase())) {
      console.log(`❌ nome ${emp.name} já usado por ${nameInUse.get(emp.name.toLowerCase())} — abortando`);
      abort = true;
    }
  }
  if (abort) { console.log('\nNada foi gravado.'); process.exit(1); }

  // 2) Mostrar o payload exato
  for (const emp of newEmployees) {
    console.log(`Vai gravar employees/${emp.id}:`);
    console.log(JSON.stringify({ ...emp, created_at: '<ISO now>' }, null, 2));
    console.log();
  }
  console.log(`maxId atual no Firestore: ${maxId}. Counter de employees será ajustado para >= 113.\n`);

  if (!COMMIT) { console.log('DRY-RUN: nada gravado. Rode novamente com --commit.'); process.exit(0); }

  // 3) Gravar (set) cada colaborador
  for (const emp of newEmployees) {
    await db.collection('employees').doc(String(emp.id)).set({
      ...emp,
      created_at: new Date().toISOString(),
    });
    console.log(`✓ ${emp.name} criado (id ${emp.id}, leader_id=${emp.leader_id}, solides=${emp.solides_employee_id})`);
  }

  // 4) Ajustar o counter para não colidir em criações futuras (getNextId)
  const counterRef = db.collection('counters').doc('employees');
  await db.runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    const current = doc.exists ? (doc.data()!.value as number) : 0;
    const next = Math.max(current, 113);
    tx.set(counterRef, { value: next });
    console.log(`✓ counter employees: ${current} -> ${next}`);
  });

  // 5) Ler de volta para confirmar
  console.log('\n=== Verificação pós-gravação ===');
  for (const emp of newEmployees) {
    const d = await db.collection('employees').doc(String(emp.id)).get();
    console.log(JSON.stringify(d.data()));
  }

  console.log('\nConcluído.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
