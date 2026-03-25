/**
 * Script para popular os vencimentos de férias no Firestore.
 * Uso: npm run seed-vacation-schedules
 */

import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import path from 'path';
import fs from 'fs';

// ─── Inicializa Firebase ─────────────────────────────────────────────────────
// Tenta: 1) FIREBASE_SERVICE_ACCOUNT_BASE64, 2) firebase-key.json

if (getApps().length === 0) {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;

  if (b64) {
    const serviceAccount = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    initializeApp({ credential: cert(serviceAccount) });
    console.log('Firebase inicializado via FIREBASE_SERVICE_ACCOUNT_BASE64\n');
  } else {
    const keyPath = path.resolve(process.cwd(), 'firebase-key.json');
    if (!fs.existsSync(keyPath)) {
      console.error([
        'Nenhuma credencial válida encontrada.',
        'Opções:',
        '  1) Defina FIREBASE_SERVICE_ACCOUNT_BASE64 no .env',
        '  2) Coloque um firebase-key.json válido na pasta backend/',
        'Gere um novo em: Firebase Console → Project Settings → Service Accounts',
      ].join('\n'));
      process.exit(1);
    }
    const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    initializeApp({ credential: cert(serviceAccount) });
    console.log('Firebase inicializado via firebase-key.json\n');
  }
}

const db = getFirestore();

// ─── Coleções ────────────────────────────────────────────────────────────────

const EMPLOYEES_COL = 'employees';
const VACATION_SCHEDULES_COL = 'vacation_schedules';
const COUNTERS_COL = 'counters';

// ─── Dados de vencimento ─────────────────────────────────────────────────────
// [nome, fim_aquisitivo (DD/MM/YYYY), limite_gozo (DD/MM/YYYY)]
const RAW_DATA: [string, string, string][] = [
  // Grupo 1
  ['AMANDA SANTOS COSTA',                       '19/11/2025', '21/08/2026'],
  ['BRUNA CÂNDIDO DE LIMA',                     '19/11/2025', '21/08/2026'],
  ['CAIQUE DOS SANTOS DA SILVA',                '25/01/2026', '27/10/2026'],
  ['CAMILLA EMANUELLE LOPES DE ALMEIDA',        '26/06/2026', '28/03/2027'],
  ['CARLOS EDUARDO SILVA DE OLIVEIRA',          '26/12/2025', '27/09/2026'],
  ['DANIELLE DOS SANTOS SILVA',                 '04/02/2026', '06/11/2026'],
  ['EDNA LOPES DA SILVA',                       '31/01/2026', '02/11/2026'],
  ['HUGO CASTRO LOPES',                         '15/12/2026', '16/09/2027'],
  ['JAINE MARIANA RODRIGUES MENDONÇA',          '02/03/2027', '02/12/2027'],
  ['JOÃO RICARDO DANTAS ALBUQUERQUE',           '15/12/2026', '16/09/2027'],
  ['JOÃO VICTOR SANTOS DA SILVA',               '30/11/2025', '01/09/2026'],
  ['JONATHAN HENRIQUE DA CONCEIÇÃO SILVA',      '17/02/2027', '19/11/2027'],
  ['JORDELLE MEYGRE COSTA DE OLIVEIRA',         '31/03/2026', '02/01/2027'],
  ['LUAN SANTOS DE OLIVEIRA',                   '05/07/2026', '06/04/2027'],
  ['LUIS HENRIQUE BATISTA DOS SANTOS',          '21/07/2026', '22/04/2027'],
  ['MARIA VICTÓRIA SOUZA ARAUJO FERRO',         '25/02/2026', '27/11/2026'],
  ['PEDRO LUCAS ROCHA DA FONSECA',              '21/08/2026', '23/05/2027'],
  ['RAQUELE FRANGOSO DA SILVA',                 '01/12/2026', '02/09/2027'],
  ['RAVY THIAGO VIEIRA DA SILVA',               '19/11/2025', '21/08/2026'],
  ['YASMIM DA ROCHA BEZERRA BARBOSA',           '15/07/2026', '16/04/2027'],

  // Grupo 2
  ['ALBERTO GUILHERME DA SILVA MARTINS',        '31/03/2026', '02/01/2027'],
  ['ALBERTO LUIZ MARINHO BATISTA',              '06/06/2026', '08/03/2027'],
  ['ANA LUIZA DOS SANTOS',                      '30/06/2026', '01/04/2027'],
  ['ANDERSON ROSALVO ROCHA DOS SANTOS',         '02/12/2026', '03/09/2027'],
  ['ANE CAROLINE PEREIRA MARTÉR',               '08/12/2026', '09/09/2027'],
  ['CLAUDIO BISPO DOS SANTOS',                  '24/01/2026', '26/10/2026'],
  ['DANRLEY FIRMINO DOS SANTOS',                '02/06/2026', '04/03/2027'],
  ['EDIVALDO DA CRUZ',                          '11/02/2026', '13/11/2026'],
  ['EMANOELLE FEITOSA VIEIRA SANTOS',           '23/08/2026', '25/05/2027'],
  ['GESSICA APARECIDA DOS SANTOS QUEIROZ',      '30/09/2025', '01/07/2026'],
  ['GESSYCA NAYARA ROCHA SANTOS',               '08/08/2025', '10/05/2026'],
  ['GISELLE DOS SANTOS ROBERTO',                '01/09/2026', '03/06/2027'],
  ['JOAO ANTONIO TAVARES SANTOS',               '03/01/2027', '05/10/2027'],
  ['JOSE FERNANDO DOS SANTOS SANTANA RAMOS',    '31/05/2026', '02/03/2027'],
  ['JOSIMARA FERREIRA MONTEIRO',                '11/09/2026', '13/06/2027'],
  ['JOYCE CASSIMIRO SOUTO',                     '14/07/2026', '15/04/2027'],
  ['JULIENE BEZERRA',                           '10/02/2026', '12/11/2026'],
  ['KAMILLA SANTOS DA SILVA',                   '16/06/2026', '18/05/2027'],
  ['KARINE CELESTINO EVANGELISTA DOS SANTOS',   '17/08/2026', '19/05/2027'],
  ['KAUANNE IWASHITA DA SILVA',                 '24/01/2026', '26/10/2026'],
  ['LAIS MANUELLE SANTOS PEREIRA',              '21/03/2026', '20/12/2026'],
  ['LETICIA SEIXAS SANTOS',                     '02/06/2025', '04/03/2026'],
  ['LETICIA SOARES BELO',                       '18/11/2025', '20/08/2026'],
  ['LIANDA MELINDA SANTOS CALIXTO',             '07/09/2026', '09/06/2027'],
  ['LUCIANO TORRES',                            '10/02/2026', '12/11/2026'],
  ['LUCIENE DA SILVA NASCIMENTO',               '27/04/2026', '29/01/2027'],
  ['LUDMYLLA WOLPERT MELO',                     '05/11/2026', '07/08/2027'],
  ['LUIZ FELLIPE GUEDES SANTOS SILVA',          '04/04/2026', '06/01/2027'],
  ['MARCIO ALIF SANTOS SILVA',                  '05/05/2026', '06/02/2027'],
  ['MARIA TATIANE OLIVEIRA SANTOS',             '15/09/2025', '17/06/2026'],
  ['MILLENA STHEFANY DOS SANTOS CRUZ',          '18/03/2026', '17/12/2026'],
  ['NATALI DE SOUZA GONZAGA',                   '09/11/2025', '11/08/2026'],
  ['NATHALIA VIEIRA LIMA',                      '21/11/2025', '23/08/2026'],
  ['PAULO CESAR DA SILVA SANTOS JUNIOR',        '20/01/2026', '22/10/2026'],
  ['PAULO ROGERIO SANTOS',                      '16/01/2026', '18/10/2026'],
  ['RODRIGO AUGUSTO TEIXEIRA DOS SANTOS',       '17/06/2026', '19/03/2027'],
  ['ROMULO JOSE SANTOS LISBOA',                 '03/05/2026', '04/02/2027'],
  ['ROSILENE MARTINS DA SILVA',                 '08/12/2026', '09/09/2027'],
  ['SABRINA DOMINGOS SANTOS',                   '01/12/2026', '02/09/2027'],
  ['SANDRA DA CONCEIÇÃO FREITAS',               '08/12/2026', '09/09/2027'],
  ['THALITA RUANNA SANTOS PEREIRA',             '10/12/2026', '11/09/2027'],
  ['THALYS GOMES DOS SANTOS',                   '21/03/2026', '20/12/2026'],
  ['YURI CASTRO GOMES',                         '08/06/2026', '10/03/2027'],

  // Grupo 3
  ['GABRIELLE VITORIA DOS SANTOS',              '07/09/2026', '09/06/2027'],
  ['MARYANNA FRANCIELLY TRAJANO DA SILVA',      '07/09/2026', '09/06/2027'],

  // Grupo 4
  ['CAMILLE KAUANE DA SILVA NUNES',             '03/09/2025', '05/06/2026'],
  ['KEMILLY RAFAELLY SOUZA SILVA',              '21/11/2025', '23/08/2026'],
  ['ERICK CAFÉ SANTOS JÚNIOR',                  '07/02/2026', '09/11/2026'],
  ['ELIENE DA SILVA SANTOS',                    '27/05/2026', '28/02/2027'],
  ['MARIA TATIANE BASTO CARDOSO',               '26/08/2026', '28/07/2027'],
  ['ANNY KAROLINE ANDRADE SANTOS',              '20/02/2027', '22/11/2027'],

  // Grupo 5
  ['MARIA TACIANE PEREIRA BARBOSA',             '11/01/2026', '13/10/2026'],
  ['BRUNA RAYANE OLIVEIRA DOS SANTOS',          '09/03/2026', '08/12/2026'],
  ['THAMIRYS DA SILVA SILVESTRINI',             '09/03/2026', '08/12/2026'],
  ['ANA PAULA AMARAL SANTOS ISMERIM',           '22/10/2026', '23/07/2027'],

  // Grupo 6
  ['VALESCA MEIRELLE BEZERRA VITORIO',          '30/06/2025', '01/04/2026'],
  ['ROBERIA GILO DA SILVA',                     '07/09/2025', '09/06/2026'],
  ['RAFAELA ALVES MENDES',                      '02/12/2025', '03/09/2026'],
  ['TOMÁS AZEVEDO SANTOS',                      '01/01/2026', '03/10/2026'],
  ['YASMIN ABILIA FERRO DA SILVA',              '22/12/2026', '23/09/2027'],

  // Grupo 7
  ['MICHAELL JEAN NUNES DE CARVALHO',           '23/09/2025', '19/07/2026'],
  ['LEIDIANE SOUZA',                            '25/09/2025', '27/06/2026'],
  ['MARIA NOBRE FARIAS DE FRANCA',              '06/11/2025', '08/08/2026'],
  ['ALYNI MAYARA FARIAS DA SILVA SANTOS',       '30/11/2025', '01/09/2026'],
  ['THAYANE MAYARA DOS SANTOS',                 '10/12/2025', '01/11/2026'],
  ['MARIANE SANTOS SOUSA',                      '31/01/2026', '02/11/2027'],
  ['ANA CLARA DE MATOS CHAGAS',                 '26/02/2026', '12/12/2026'],
  ['DEISE GISLANE SILVA VITOR',                 '16/06/2026', '18/03/2027'],
  ['SAMYRA ANCHIETA BISPO',                     '07/09/2026', '09/06/2027'],
  ['CRISTIELLE PEREIRA LIMA DA SILVA',          '22/11/2026', '24/08/2027'],
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalize(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDateBR(date: string): string {
  const [d, m, y] = date.split('/');
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

async function getNextId(collection: string): Promise<number> {
  const counterRef = db.collection(COUNTERS_COL).doc(collection);
  const result = await db.runTransaction(async (tx) => {
    const doc = await tx.get(counterRef);
    const current = doc.exists ? (doc.data()!.value as number) : 0;
    const next = current + 1;
    tx.set(counterRef, { value: next });
    return next;
  });
  return result;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Seed: Vencimentos de Férias ===\n');

  // Carrega todos os employees
  const empSnap = await db.collection(EMPLOYEES_COL).get();
  const employees = empSnap.docs.map(d => ({ id: d.data().id as number, name: d.data().name as string }));
  const empByName = new Map(employees.map(e => [normalize(e.name), e]));

  console.log(`Colaboradores encontrados no sistema: ${employees.length}\n`);

  let inserted = 0;
  let skipped = 0;
  const notFound: string[] = [];
  const alreadyExists: string[] = [];

  for (const [rawName, rawP1, rawP2] of RAW_DATA) {
    const key = normalize(rawName);
    let emp = empByName.get(key);

    // Match parcial pelos 3 primeiros tokens
    if (!emp) {
      const tokens = key.split(' ').slice(0, 3).join(' ');
      const partial = [...empByName.entries()].find(([k]) => k.startsWith(tokens));
      if (partial) {
        emp = partial[1];
        console.log(`  ~ Parcial: "${rawName}" → "${emp.name}"`);
      }
    }

    if (!emp) {
      notFound.push(rawName);
      skipped++;
      continue;
    }

    // Verifica se já existe
    const existingSnap = await db.collection(VACATION_SCHEDULES_COL)
      .where('employee_id', '==', emp.id).limit(1).get();
    if (!existingSnap.empty) {
      alreadyExists.push(emp.name);
      skipped++;
      continue;
    }

    const id = await getNextId(VACATION_SCHEDULES_COL);
    const now = new Date().toISOString();
    await db.collection(VACATION_SCHEDULES_COL).doc(String(id)).set({
      id,
      employee_id: emp.id,
      period_1_date: parseDateBR(rawP1),
      period_2_date: parseDateBR(rawP2),
      notes: null,
      created_at: now,
      updated_at: now,
    });
    console.log(`  ✓ ${emp.name}: ${parseDateBR(rawP1)} → ${parseDateBR(rawP2)}`);
    inserted++;
  }

  console.log('\n─── Resumo ────────────────────────────────────');
  console.log(`  Inseridos:       ${inserted}`);
  console.log(`  Já existiam:     ${alreadyExists.length}`);
  console.log(`  Não encontrados: ${notFound.length}`);

  if (notFound.length > 0) {
    console.log('\n  ⚠ Nomes não encontrados no sistema:');
    for (const n of notFound) console.log(`    - ${n}`);
  }

  if (alreadyExists.length > 0) {
    console.log('\n  ℹ Já tinham vencimento (ignorados):');
    for (const n of alreadyExists) console.log(`    - ${n}`);
  }

  console.log('\nConcluído!');
  process.exit(0);
}

main().catch(err => {
  console.error('Erro:', err);
  process.exit(1);
});
