import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

// SOMENTE LEITURA — quem bate ponto mas não tem slack_id? Esses caem no caminho
// em que o sync tenta o DM, não consegue e nunca marca alert_sent (retry a cada 5 min).
async function main() {
  const snap = await db.collection('employees').get();
  const semSlack = snap.docs.map(d => d.data()).filter(e => !e.slack_id);

  console.log(`Total employees: ${snap.size}`);
  console.log(`Sem slack_id: ${semSlack.length}\n`);

  const batemPonto = semSlack.filter(e => e.no_punch_required !== true);
  const naoBatemPonto = semSlack.filter(e => e.no_punch_required === true);

  console.log(`═══ SEM SLACK e BATEM PONTO (${batemPonto.length}) — afetados pelo retry ═══`);
  batemPonto.forEach(e => console.log(`  [${e.id}] ${e.name} | leader=${e.leader_id} solides=${e.solides_employee_id}`));

  console.log(`\n═══ SEM SLACK e no_punch_required=true (${naoBatemPonto.length}) — nunca alertam ═══`);
  naoBatemPonto.forEach(e => console.log(`  [${e.id}] ${e.name} | leader=${e.leader_id}`));

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
