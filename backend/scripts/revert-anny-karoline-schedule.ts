import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();
const APPLY = process.argv.includes('--apply');

// Anny Karoline Andrade Santos - employee id 64 (Loja Digital, gestora Mariane/12)
// 2026-07-21: volta à jornada PADRÃO — 8h/dia Seg-Sex com 2h de almoço (4 pontos)
// e 4h aos sábados. Reverte o que update-anny-karoline-schedule.ts fez.
//
// Este script sozinho NÃO basta: é preciso remover o nome dela de
// NO_LUNCH_EMPLOYEES em src/config/constants.ts (feito no mesmo commit),
// senão ela continua sendo tratada como jornada direta de 2 pontos.
async function main() {
  const ref = db.collection('employees').doc('64');
  const before = (await ref.get()).data();
  if (!before) {
    console.error('Anny Karoline (id=64) não encontrada');
    process.exit(1);
  }

  console.log('Antes:', JSON.stringify(before, null, 2));
  console.log('\nMudanças:');
  console.log(`  works_saturday:         ${before.works_saturday} -> true`);
  console.log(`  expected_daily_minutes: ${before.expected_daily_minutes} -> 480`);
  console.log(`  schedule_overrides:     ${JSON.stringify(before.schedule_overrides ?? null)} -> (campo removido)`);

  if (!APPLY) {
    console.log('\n[dry-run] Nada foi gravado. Rode com --apply para aplicar.');
    process.exit(0);
  }

  await ref.update({
    works_saturday: true,
    expected_daily_minutes: 480,
    schedule_overrides: FieldValue.delete(),
  });

  const after = (await ref.get()).data();
  console.log('\nDepois:', JSON.stringify(after, null, 2));
  console.log('\n✓ Jornada padrão restaurada: 480 min Seg-Sex (4 pontos, 2h de almoço) + 240 min sábado.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
