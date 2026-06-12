import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}
const db = getFirestore();
const TOKEN = process.env.SOLIDES_API_TOKEN!;

async function main() {
  // Sólides: todos os ativos
  const url = new URL('https://employer.tangerino.com.br/employee/find-all');
  url.searchParams.set('page', '0');
  url.searchParams.set('size', '500');
  url.searchParams.set('showFired', 'false');
  const res = await fetch(url.toString(), { headers: { Authorization: TOKEN, Accept: 'application/json' } });
  const data: any = await res.json();
  const solidesActive = (data.content || []).map((e: any) => ({ id: String(e.id), name: e.name }));

  // Firestore: solides ids mapeados
  const snap = await db.collection('employees').get();
  const mapped = new Set(snap.docs.map(d => String(d.data().solides_employee_id || '')));

  console.log('═══ Ativos na Sólides SEM employee no Firestore ═══');
  for (const s of solidesActive) {
    if (!mapped.has(s.id)) console.log(`  Sólides ${s.id}: ${s.name}`);
  }

  console.log('\n═══ Busca "brunna" na Sólides (qualquer status) ═══');
  const url2 = new URL('https://employer.tangerino.com.br/employee/find-all');
  url2.searchParams.set('page', '0');
  url2.searchParams.set('size', '500');
  url2.searchParams.set('showFired', 'true');
  const res2 = await fetch(url2.toString(), { headers: { Authorization: TOKEN, Accept: 'application/json' } });
  const data2: any = await res2.json();
  (data2.content || []).filter((e: any) => e.name.toLowerCase().includes('brunna')).forEach((e: any) =>
    console.log(`  Sólides ${e.id}: ${e.name}`));

  console.log('\n═══ daily_records de HOJE para ids 101/102 ═══');
  for (const docId of ['101_2026-06-12', '102_2026-06-12']) {
    const d = await db.collection('daily_records').doc(docId).get();
    console.log(`  ${docId}: ${d.exists ? JSON.stringify(d.data()) : 'não existe'}`);
  }
  process.exit(0);
}
main().catch(e => { console.error(e); process.exit(1); });
