import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!;
  const sa = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

function parseDateBR(d: string) {
  const [dd, mm, yyyy] = d.split('/');
  return `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`;
}

async function getNextId() {
  const ref = db.collection('counters').doc('vacation_schedules');
  return db.runTransaction(async tx => {
    const doc = await tx.get(ref);
    const next = (doc.exists ? (doc.data()!.value as number) : 0) + 1;
    tx.set(ref, { value: next });
    return next;
  });
}

const toInsert = [
  { employee_id: 41, name: 'Raquele Fragoso Da Silva',     p1: '01/12/2026', p2: '02/09/2027' },
  { employee_id: 61, name: 'THAMIRYS SILVESTRINI MORALES', p1: '09/03/2026', p2: '08/12/2026' },
  { employee_id: 56, name: 'Deise Gislaine Silva vitor',   p1: '16/06/2026', p2: '18/03/2027' },
];

async function main() {
  const now = new Date().toISOString();
  for (const emp of toInsert) {
    const existing = await db.collection('vacation_schedules').where('employee_id', '==', emp.employee_id).limit(1).get();
    if (!existing.empty) {
      console.log(`  já existe: ${emp.name}`);
      continue;
    }
    const id = await getNextId();
    await db.collection('vacation_schedules').doc(String(id)).set({
      id,
      employee_id: emp.employee_id,
      period_1_date: parseDateBR(emp.p1),
      period_2_date: parseDateBR(emp.p2),
      notes: null,
      created_at: now,
      updated_at: now,
    });
    console.log(`  ✓ ${emp.name}: ${parseDateBR(emp.p1)} → ${parseDateBR(emp.p2)}`);
  }
  console.log('Concluído!');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
