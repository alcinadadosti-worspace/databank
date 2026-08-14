import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();
const APPLY = process.argv.includes('--apply');

// Anny Karoline Andrade Santos - employee id 64
// 2026-08-14: sai da Loja Digital (Mariane, leader_id=12) para a Loja Penedo
// (Maria Taciane, leader_id=11).
//
// Este script sozinho NÃO basta (mesmo commit precisa de):
//  - queries.ts: nome dela em LOJA_PENEDO_EMPLOYEES (unidade virtual no painel)
//  - constants.ts: nome dela em EXTENDED_SATURDAY_EMPLOYEES (sábado até 14:00 = 360 min)
async function main() {
  const ref = db.collection('employees').doc('64');
  const before = (await ref.get()).data();
  if (!before) {
    console.error('Anny Karoline (id=64) não encontrada');
    process.exit(1);
  }
  if (!before.name?.toLowerCase().includes('anny karoline')) {
    console.error(`Doc 64 não é a Anny Karoline (name=${before.name}); abortando`);
    process.exit(1);
  }

  console.log('Antes:', JSON.stringify(before, null, 2));
  console.log('\nMudança:');
  console.log(`  leader_id: ${before.leader_id} -> 11 (Maria Taciane, Loja Penedo)`);

  if (!APPLY) {
    console.log('\n[dry-run] Nada foi gravado. Rode com --apply para aplicar.');
    process.exit(0);
  }

  await ref.update({ leader_id: 11 });

  const after = (await ref.get()).data();
  console.log('\nDepois:', JSON.stringify(after, null, 2));
  console.log('\n✓ Anny Karoline movida para Maria Taciane (leader_id=11, Loja Penedo).');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
