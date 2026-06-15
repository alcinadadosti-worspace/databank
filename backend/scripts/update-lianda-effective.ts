import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

// Lianda Melinda Santos Calixto - employee id 75
// Deixou de ser estagiária (2 pontos, 6h, terça livre) e virou EFETIVA padrão:
//   - Jornada 8h/dia (480 min), batendo 4 pontos (entrada, almoço, retorno, saída)
//   - Trabalha aos sábados (08:00–12:00 = 240 min)
//   - Sem folga de terça (curso encerrado)
async function main() {
  const ref = db.collection('employees').doc('75');
  const before = (await ref.get()).data();
  if (!before) {
    console.error('Lianda (id=75) não encontrada');
    process.exit(1);
  }
  console.log('Antes:', JSON.stringify(before, null, 2));

  await ref.update({
    is_intern: false,
    is_apprentice: false,
    expected_daily_minutes: 480,
    works_saturday: true,
    exemption_days: FieldValue.delete(),
    exemption_reason: FieldValue.delete(),
  });

  const after = (await ref.get()).data();
  console.log('\nDepois:', JSON.stringify(after, null, 2));
  console.log('\n✓ Lianda efetivada: 8h/dia (480 min, 4 pontos), trabalha sábado, sem folga de terça.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
