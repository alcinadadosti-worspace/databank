import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();
const APPLY = process.argv.includes('--apply');

// Juliene Reis Ferreira - employee id 121 (Loja Digital, gestora Mariane/12).
// 2026-07-22: passa a ter a MESMA jornada da Anny Karoline (id 64):
//   Seg-Sex 08:30→17:30 DIRETO, sem almoço = 540 min/dia, 2 pontos.
//   NÃO trabalha aos sábados (works_saturday=false), espelhando a Anny.
// Complemento do código: o nome dela entra em NO_LUNCH_EMPLOYEES
// (src/config/constants.ts, mesmo commit) — sem isso o sistema exige 4 pontos
// e os dias de semana não calculam.
async function main() {
  const ref = db.collection('employees').doc('121');
  const before = (await ref.get()).data();
  if (!before) {
    console.error('Juliene Reis (id=121) não encontrada');
    process.exit(1);
  }
  if (!before.name?.toLowerCase().includes('juliene')) {
    console.error(`ABORTADO: doc 121 não é a Juliene (name="${before.name}")`);
    process.exit(1);
  }

  console.log('Antes:', JSON.stringify(before, null, 2));
  console.log('\nMudanças:');
  console.log(`  works_saturday:         ${before.works_saturday} -> false`);
  console.log(`  expected_daily_minutes: ${before.expected_daily_minutes} -> 540`);
  console.log(`  schedule_overrides:     ${JSON.stringify(before.schedule_overrides ?? null)} -> {"1":540,"2":540,"3":540,"4":540,"5":540}`);

  if (!APPLY) {
    console.log('\n[dry-run] Nada foi gravado. Rode com --apply para aplicar.');
    process.exit(0);
  }

  await ref.update({
    works_saturday: false,
    expected_daily_minutes: 540,
    schedule_overrides: { '1': 540, '2': 540, '3': 540, '4': 540, '5': 540 },
  });

  const after = (await ref.get()).data();
  console.log('\nDepois:', JSON.stringify(after, null, 2));
  console.log('\n✓ Juliene com jornada 2 pontos/sem almoço (540 min Seg-Sex), sem sábado — igual à Anny.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
