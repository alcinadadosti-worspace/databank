import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

// Anny Karoline Andrade Santos - employee id 64 (Loja Digital)
// Jornada: Seg-Sex 08:30 → 17:30 DIRETO, sem intervalo de almoço = 9h = 540 min/dia.
// Bate apenas 2 pontos por dia (entrada e saída) — tratada como "no-lunch employee"
// (ver NO_LUNCH_EMPLOYEES em src/config/constants.ts).
// Não trabalha aos sábados.
// JS day-of-week: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri
async function main() {
  const ref = db.collection('employees').doc('64');
  const before = (await ref.get()).data();
  if (!before) {
    console.error('Anny Karoline (id=64) não encontrada');
    process.exit(1);
  }
  console.log('Antes:', JSON.stringify(before, null, 2));

  await ref.update({
    works_saturday: false,
    schedule_overrides: { '1': 540, '2': 540, '3': 540, '4': 540, '5': 540 },
    expected_daily_minutes: 540,
  });

  const after = (await ref.get()).data();
  console.log('\nDepois:', JSON.stringify(after, null, 2));
  console.log('\n✓ Jornada atualizada: Seg-Sex 08:30→17:30 direto (540 min/dia, sem almoço, 2 pontos). Não trabalha sábado.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
