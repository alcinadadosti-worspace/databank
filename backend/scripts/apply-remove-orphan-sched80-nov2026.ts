/**
 * Remove o registro orfao vacation_schedules/80 (employee_id 85 nao existe mais, ex-Michaell Jean).
 * O Michaell ganhou registro novo no cadastro atual (emp 127) no lote de nov/2026.
 * So apaga se todas as condicoes continuarem verdadeiras.
 *
 * Uso: npx tsx scripts/apply-remove-orphan-sched80-nov2026.ts [--apply]   (sem --apply = simulacao)
 */
import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'path';
import fs from 'fs';

if (getApps().length === 0) {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (b64) {
    initializeApp({ credential: cert(JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))) });
  } else {
    initializeApp({ credential: cert(JSON.parse(fs.readFileSync(path.resolve(process.cwd(), 'firebase-key.json'), 'utf8'))) });
  }
}
const db = getFirestore();
const APPLY = process.argv.includes('--apply');

async function main() {
  const ref = db.collection('vacation_schedules').doc('80');
  const doc = await ref.get();
  if (!doc.exists) throw new Error('vacation_schedules/80 nao existe');
  const data = doc.data() as any;
  console.log('Registro 80:', JSON.stringify(data, null, 2));

  if (data.employee_id !== 85) throw new Error(`employee_id inesperado: ${data.employee_id}`);

  const byDoc = await db.collection('employees').doc('85').get();
  const byField = await db.collection('employees').where('id', '==', 85).get();
  console.log(`employees/85 existe: ${byDoc.exists} | employees com id=85: ${byField.size}`);
  if (byDoc.exists || !byField.empty) throw new Error('employee 85 existe — nao e orfao');

  const michaell = await db.collection('employees').doc('127').get();
  console.log(`emp 127: ${michaell.data()?.name}`);
  if (!/michaell/i.test(michaell.data()?.name || '')) throw new Error('emp 127 nao e o Michaell');

  const novo = await db.collection('vacation_schedules').where('employee_id', '==', 127).get();
  console.log(`registros do emp 127: ${novo.docs.map(d => `${d.id} (${d.data().period_1_date} / ${d.data().period_2_date})`).join(', ') || 'nenhum'}`);
  if (novo.size !== 1) throw new Error('emp 127 deveria ter exatamente 1 registro');

  if (APPLY) {
    await ref.delete();
    const check = await ref.get();
    console.log(`\nAPAGADO. Existe agora: ${check.exists}`);
  } else {
    console.log('\nSIMULACAO: nada apagado');
  }
  process.exit(0);
}

main().catch(e => { console.error('Erro:', e.message); process.exit(1); });
