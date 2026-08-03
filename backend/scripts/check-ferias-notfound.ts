/** Busca solta pelos nomes da planilha que nao casaram + employee 85. Somente leitura. */
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

function normalize(name: string): string {
  return name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim();
}

const TARGETS = [
  'EDIVALDO DA CRUZ',
  'ALBERTO GUILHERME DA SILVA MARTINS',
  'DEISE GISLANE SILVA VITOR',
  'RAQUELE FRANGOSO DA SILVA',
  'JOANNA ROBERTA DE QUEIROZ VIANA',
  'JOSENILDO ALVES DA SILVA JÚNIOR',
  'SHAYANE OLIVEIRA FERREIRA',
];

async function main() {
  const empSnap = await db.collection('employees').get();
  const employees = empSnap.docs.map(d => d.data() as any);

  for (const t of TARGETS) {
    const tokens = normalize(t).split(' ').filter(w => w.length > 2);
    const hits = employees.filter(e => {
      const n = normalize(e.name);
      return tokens.filter(tok => n.includes(tok)).length >= 2;
    });
    console.log(`\n"${t}":`);
    if (hits.length === 0) console.log('  (nenhum candidato)');
    for (const h of hits) console.log(`  candidato: emp ${h.id} — ${h.name} (leader ${h.leader_id}, status ${h.status ?? h.active ?? '?'})`);
  }

  const emp85 = employees.find(e => e.id === 85);
  console.log(`\nEmployee 85: ${emp85 ? JSON.stringify(emp85) : 'NAO EXISTE na colecao employees'}`);

  const maxId = Math.max(...employees.map(e => e.id));
  console.log(`Max employee id: ${maxId}; total: ${employees.length}`);
  const ids116plus = employees.filter(e => e.id >= 116).map(e => `${e.id}:${e.name}`);
  console.log(`IDs >= 116: ${ids116plus.join(' | ') || '(nenhum)'}`);

  process.exit(0);
}

main().catch(err => { console.error('Erro:', err); process.exit(1); });
