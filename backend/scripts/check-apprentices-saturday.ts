/** READ-ONLY: mostra config de Yuri Castro, Raquele Fragoso e Bruna Isabelly + registros de sabados recentes. */
import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();
const NAMES = ['yuri', 'raquele', 'bruna isabelly'];
const SATURDAYS = ['2026-08-01', '2026-08-08', '2026-08-15'];

async function main() {
  const empSnap = await db.collection('employees').get();
  const all = empSnap.docs.map(d => d.data() as any);

  for (const key of NAMES) {
    const matches = all.filter(e => e.name?.toLowerCase().includes(key));
    for (const emp of matches) {
      console.log(`=== id=${emp.id} ${emp.name} ===`);
      console.log(`    leader_id=${emp.leader_id} is_apprentice=${emp.is_apprentice ?? 'undef'} apprentice_minutes=${emp.apprentice_daily_minutes ?? emp.apprentice_minutes ?? 'undef'}`);
      console.log(`    works_saturday=${emp.works_saturday ?? 'undef'} expected_daily_minutes=${emp.expected_daily_minutes ?? 'undef'} overrides=${JSON.stringify(emp.schedule_overrides ?? null)}`);
      console.log(`    no_punch_required=${emp.no_punch_required ?? false} is_intern=${emp.is_intern ?? 'undef'}`);

      const recSnap = await db.collection('daily_records').where('employee_id', '==', emp.id).get();
      const recs = recSnap.docs.map(d => d.data() as any)
        .filter(r => SATURDAYS.includes(r.date))
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
      if (recs.length === 0) console.log('    (sem daily_records nos sabados 01/08, 08/08, 15/08)');
      for (const r of recs) {
        console.log(`    SAB ${r.date}: p=[${r.punch_1 ?? '--'} ${r.punch_2 ?? '--'}] classif=${r.classification ?? 'null'} trab=${r.total_worked_minutes ?? '-'} dif=${r.difference_minutes ?? '-'}`);
      }
    }
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
