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

const novatos = [
  {
    name: 'Luiz Fellipe Guedes Santos Silva',
    solides_employee_id: '4370927',
    slack_id: 'U08E4LNLG06',
    leader_id: 2,           // Alberto Luiz Marinho Batista — Logistica
    vacation: { p1: '04/04/2026', p2: '06/01/2027' },
  },
  {
    name: 'Ane Caroline Pereira marter',
    solides_employee_id: '5881212',
    slack_id: 'U0A2PUWCUKS',
    leader_id: 9,           // Ana Clara de Matos Chagas — Canal VD / Salão Penedo
    vacation: { p1: '08/12/2026', p2: '09/09/2027' },
  },
  {
    name: 'Jaine Mariana Rodrigues Mendonça',
    solides_employee_id: '6168358',
    slack_id: 'U0AHTBS64KH',
    leader_id: 4,           // Jonathan Henrique — VD Palmeira dos Indios
    vacation: { p1: '02/03/2027', p2: '02/12/2027' },
  },
  {
    name: 'Thamires Emanuelle da Silva',
    solides_employee_id: '6232209',
    slack_id: 'U0AMSCAC1HR',
    leader_id: null,
    vacation: null,         // datas ainda não disponíveis
  },
  {
    name: 'Fabia Batista da Silva',
    solides_employee_id: '6244890',
    slack_id: 'U0AMN750JT0',
    leader_id: null,
    vacation: null,         // datas ainda não disponíveis
  },
];

async function main() {
  const now = new Date().toISOString();

  for (const emp of novatos) {
    // Verifica se já existe pelo solides_employee_id
    const existing = await db.collection('employees')
      .where('solides_employee_id', '==', emp.solides_employee_id).limit(1).get();

    let empId: number;
    if (!existing.empty) {
      empId = existing.docs[0].data().id as number;
      console.log(`  já existe (ID ${empId}): ${emp.name}`);
    } else {
      empId = await getNextId('employees');
      await db.collection('employees').doc(String(empId)).set({
        id: empId,
        name: emp.name,
        solides_employee_id: emp.solides_employee_id,
        slack_id: emp.slack_id,
        leader_id: emp.leader_id,
        secondary_approver_id: null,
        created_at: now,
      });
      console.log(`  ✓ employee criado (ID ${empId}): ${emp.name}`);
    }

    if (!emp.vacation) {
      console.log(`    sem datas de vencimento por enquanto\n`);
      continue;
    }

    const vsSnap = await db.collection('vacation_schedules')
      .where('employee_id', '==', empId).limit(1).get();
    if (!vsSnap.empty) {
      console.log(`    vencimento já existe\n`);
      continue;
    }

    const vsId = await getNextId('vacation_schedules');
    await db.collection('vacation_schedules').doc(String(vsId)).set({
      id: vsId,
      employee_id: empId,
      period_1_date: parseDateBR(emp.vacation.p1),
      period_2_date: parseDateBR(emp.vacation.p2),
      notes: null,
      created_at: now,
      updated_at: now,
    });
    console.log(`    ✓ vencimento: ${parseDateBR(emp.vacation.p1)} → ${parseDateBR(emp.vacation.p2)}\n`);
  }

  console.log('Concluído!');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
