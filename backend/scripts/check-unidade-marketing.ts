import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

import * as queries from '../src/models/queries';

// SOMENTE LEITURA — roda o mesmo getUnitRecords que alimenta a aba Unidades,
// para conferir se João Paulo (125) aparece no card Marketing da Suzana.
async function main() {
  const date = process.argv[2] || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  console.log(`Data: ${date}\n`);

  const units = await queries.getUnitRecords(date);
  console.log('Unidades retornadas:', units.map(u => u.unit_name).join(', '), '\n');

  const marketing = units.find(u => u.unit_name === 'Marketing');
  if (!marketing) { console.log('❌ Card "Marketing" NÃO foi montado'); process.exit(1); }

  console.log(`═══ CARD MARKETING (leader_id=${marketing.leader_id}, ${marketing.leader_name}) ═══`);
  console.log(`presentes ${marketing.present_count}/${marketing.total_count}`);
  for (const e of marketing.employees) {
    console.log(`  [${e.id}] ${e.name} | present=${e.present} p1=${e.punch_1 ?? '-'} p2=${e.punch_2 ?? '-'} p3=${e.punch_3 ?? '-'} p4=${e.punch_4 ?? '-'} ferias=${e.is_on_vacation} folga=${e.is_on_folga}`);
  }

  const jp = marketing.employees.find(e => e.id === 125);
  console.log(`\n${jp ? '✓ João Paulo (125) ESTÁ no card Marketing' : '❌ João Paulo (125) NÃO está no card Marketing'}`);

  // Também confere se ele não caiu na unidade "Sem Ponto" por engano
  const semPonto = units.find(u => u.unit_name.toLowerCase().includes('sem ponto'));
  if (semPonto?.employees.some(e => e.id === 125)) console.log('⚠️  Ele aparece também em "Sem Ponto"');

  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
