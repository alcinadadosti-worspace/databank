/**
 * Cadastra colaboradores que não batem ponto e insere seus vencimentos de férias.
 * sem solides_employee_id → não aparecem no tracking de ponto.
 */
import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

function parseDateBR(d: string) {
  const [dd, mm, yyyy] = d.split('/');
  return `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
}

async function getNextId(collection: string): Promise<number> {
  const ref = db.collection('counters').doc(collection);
  return db.runTransaction(async tx => {
    const doc = await tx.get(ref);
    const next = (doc.exists ? (doc.data()!.value as number) : 0) + 1;
    tx.set(ref, { value: next });
    return next;
  });
}

function normalize(name: string) {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

// [nome, fim_aquisitivo, limite_gozo]
const DATA: [string, string, string][] = [
  ['CARLOS EDUARDO SILVA DE OLIVEIRA',      '26/12/2025', '27/09/2026'],
  ['ROMULO JOSE SANTOS LISBOA',             '03/05/2026', '04/02/2027'],
  ['MICHAELL JEAN NUNES DE CARVALHO',       '23/09/2025', '19/07/2026'],
  ['LEIDIANE SOUZA',                        '25/09/2025', '27/06/2026'],
  ['PAULO ROGERIO SANTOS',                  '16/01/2026', '18/10/2026'],
  ['JOSE FERNANDO DOS SANTOS SANTANA RAMOS','31/05/2026', '02/03/2027'],
  ['RAFAELA ALVES MENDES',                  '02/12/2025', '03/09/2026'],
  ['ALBERTO LUIZ MARINHO BATISTA',          '06/06/2026', '08/03/2027'],
];

async function main() {
  const now = new Date().toISOString();

  // Carrega employees existentes para evitar duplicata
  const empSnap = await db.collection('employees').get();
  const existing = new Map(empSnap.docs.map(d => [normalize(d.data().name as string), d.data().id as number]));

  for (const [rawName, p1, p2] of DATA) {
    const key = normalize(rawName);

    // Verifica se já existe como employee
    let empId = existing.get(key);
    if (empId) {
      console.log(`  employee já existe (ID ${empId}): ${rawName}`);
    } else {
      empId = await getNextId('employees');
      await db.collection('employees').doc(String(empId)).set({
        id: empId,
        name: rawName,
        solides_employee_id: null,
        slack_id: null,
        leader_id: null,
        secondary_approver_id: null,
        created_at: now,
      });
      console.log(`  ✓ employee criado (ID ${empId}): ${rawName}`);
    }

    // Verifica se já existe vencimento
    const vsSnap = await db.collection('vacation_schedules').where('employee_id', '==', empId).limit(1).get();
    if (!vsSnap.empty) {
      console.log(`    vencimento já existe para ${rawName}`);
      continue;
    }

    const vsId = await getNextId('vacation_schedules');
    await db.collection('vacation_schedules').doc(String(vsId)).set({
      id: vsId,
      employee_id: empId,
      period_1_date: parseDateBR(p1),
      period_2_date: parseDateBR(p2),
      notes: null,
      created_at: now,
      updated_at: now,
    });
    console.log(`    ✓ vencimento inserido: ${parseDateBR(p1)} → ${parseDateBR(p2)}`);
  }

  console.log('\nConcluído!');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
