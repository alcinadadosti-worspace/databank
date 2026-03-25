import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'path';
import fs from 'fs';

if (getApps().length === 0) {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (b64) {
    const sa = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    initializeApp({ credential: cert(sa) });
  } else {
    const keyPath = path.resolve(process.cwd(), 'firebase-key.json');
    const sa = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    initializeApp({ credential: cert(sa) });
  }
}

const db = getFirestore();

const notFound = [
  ['CARLOS EDUARDO SILVA DE OLIVEIRA',       '26/12/2025', '27/09/2026'],
  ['JAINE MARIANA RODRIGUES MENDONÇA',        '02/03/2027', '02/12/2027'],
  ['RAQUELE FRANGOSO DA SILVA',               '01/12/2026', '02/09/2027'],
  ['ALBERTO GUILHERME DA SILVA MARTINS',      '31/03/2026', '02/01/2027'],
  ['ALBERTO LUIZ MARINHO BATISTA',            '06/06/2026', '08/03/2027'],
  ['ANE CAROLINE PEREIRA MARTÉR',             '08/12/2026', '09/09/2027'],
  ['EDIVALDO DA CRUZ',                        '11/02/2026', '13/11/2026'],
  ['JOSE FERNANDO DOS SANTOS SANTANA RAMOS',  '31/05/2026', '02/03/2027'],
  ['LUIZ FELLIPE GUEDES SANTOS SILVA',        '04/04/2026', '06/01/2027'],
  ['PAULO ROGERIO SANTOS',                    '16/01/2026', '18/10/2026'],
  ['ROMULO JOSE SANTOS LISBOA',               '03/05/2026', '04/02/2027'],
  ['THAMIRYS DA SILVA SILVESTRINI',           '09/03/2026', '08/12/2026'],
  ['RAFAELA ALVES MENDES',                    '02/12/2025', '03/09/2026'],
  ['MICHAELL JEAN NUNES DE CARVALHO',         '23/09/2025', '19/07/2026'],
  ['LEIDIANE SOUZA',                          '25/09/2025', '27/06/2026'],
  ['DEISE GISLANE SILVA VITOR',               '16/06/2026', '18/03/2027'],
];

function normalize(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

async function run() {
  const snap = await db.collection('employees').get();
  const employees = snap.docs.map(d => ({ id: d.data().id, name: d.data().name as string }));

  console.log('\n=== Busca por nomes não encontrados ===\n');
  const linked: [string, string, string, string][] = [];
  const notFoundList: [string, string, string][] = [];

  for (const [rawName, p1, p2] of notFound) {
    const key = normalize(rawName);
    const tokens = key.split(' ');

    // Try progressively fewer tokens
    let matches: typeof employees = [];
    for (let t = Math.min(tokens.length, 3); t >= 1; t--) {
      const prefix = tokens.slice(0, t).join(' ');
      matches = employees.filter(e => normalize(e.name).includes(prefix));
      if (matches.length > 0 && matches.length <= 8) break;
    }

    if (matches.length === 0) {
      notFoundList.push([rawName, p1, p2]);
      console.log(`❌ NÃO ENCONTRADO: ${rawName}`);
    } else {
      console.log(`? "${rawName}" => possíveis:`);
      for (const m of matches) console.log(`    ${m.id}: ${m.name}`);
    }
  }

  console.log('\n=== Resumo ===');
  console.log(`Não encontrados: ${notFoundList.length}`);
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
