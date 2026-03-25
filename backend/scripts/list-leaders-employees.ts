import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

async function main() {
  const [leadersSnap, empSnap] = await Promise.all([
    db.collection('leaders').orderBy('id').get(),
    db.collection('employees').get(),
  ]);

  const employees = empSnap.docs.map(d => d.data() as { id: number; name: string; leader_id: number | null; solides_employee_id: string | null });
  const leaders = leadersSnap.docs.map(d => d.data() as { id: number; name: string; sector: string });

  for (const leader of leaders) {
    const team = employees.filter(e => e.leader_id === leader.id);
    console.log(`\n[${leader.sector}] ${leader.name}`);
    if (team.length === 0) {
      console.log('  (nenhum colaborador)');
    } else {
      for (const e of team.sort((a, b) => a.name.localeCompare(b.name))) {
        const tag = e.solides_employee_id ? '' : ' [sem ponto]';
        console.log(`  - ${e.name}${tag}`);
      }
    }
  }

  const semGestor = employees.filter(e => !e.leader_id);
  if (semGestor.length > 0) {
    console.log('\n[Sem gestor]');
    for (const e of semGestor.sort((a, b) => a.name.localeCompare(b.name))) {
      console.log(`  - ${e.name}`);
    }
  }

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
