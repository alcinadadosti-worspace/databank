import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();

async function main() {
  const snap = await db.collection('employees').get();
  const yuri = snap.docs.find(d => d.data().name?.toLowerCase().includes('yuri castro'));

  if (!yuri) {
    console.error('Yuri Castro não encontrado');
    process.exit(1);
  }

  const before = yuri.data();
  console.log('Antes:', JSON.stringify(before, null, 2));

  // Jovem aprendiz: 6h/dia = 360 min (padrão apprentice)
  // expected_daily_minutes mantém o atual se já configurado corretamente,
  // caso contrário define 360 (6h) que é o padrão para jovem aprendiz
  const expectedMinutes = before.expected_daily_minutes && before.expected_daily_minutes < 480
    ? before.expected_daily_minutes
    : 360;

  await yuri.ref.update({
    is_apprentice: true,
    expected_daily_minutes: expectedMinutes,
    exemption_days: [4],          // 4 = quinta-feira
    exemption_reason: 'Curso às quintas-feiras',
  });

  console.log(`\n✓ ${before.name} configurado como Jovem Aprendiz`);
  console.log(`  is_apprentice: true`);
  console.log(`  expected_daily_minutes: ${expectedMinutes}`);
  console.log(`  exemption_days: [4] (quinta-feira)`);
  console.log(`  exemption_reason: "Curso às quintas-feiras"`);

  console.log('\nConcluído!');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
