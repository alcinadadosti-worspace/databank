import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();
const COMMIT = process.argv.includes('--commit');
const CLEAR = process.argv.includes('--clear');
const CLEAR_CORURIPE = process.argv.includes('--clear-coruripe');

// Lojas da Maria Taciane (leader 11) no painel de quem cuida delas — 2026-10-16
//  - Kemilly (leader 10) vê e aprova Teotônio Vilela e Coruripe; Mariane (leader 12) vê e aprova Penedo.
//  - Usa employees.secondary_approver_id: o painel do gestor (Registros, Justificativas, Ajustes,
//    Equipe, Folgas, Ausências, Sincronizar) mostra leader_id OU secondary_approver_id.
//    leader_id continua 11, então a aba Unidades do RH e o painel da Taciane não mudam.
//  - Os alertas do Slack já vão para elas (leaders/11.cover_leader_id=10 e alert_cover_leader_id=12
//    na Penedo); este campo não mexe em alerta.
//  - Dezembro: a Taciane volta e assume Coruripe → rodar com --clear-coruripe (dry-run, depois --commit).
//    Teotônio e Penedo continuam com a Kemilly e a Mariane.
const TACIANE_ID = 11;
const KEMILLY_ID = 10;
const MARIANE_ID = 12;

const STORES: { store: string; approver: number; employees: Record<number, string> }[] = [
  {
    store: 'Loja Coruripe', approver: KEMILLY_ID, employees: {
      63: 'Ana Paula Amaral Santos Ismerim',
      62: 'Bruna Rayane Oliveira dos Santos',
      113: 'Caroline Leite dos Santos',
      112: 'Evellyn Vitória Nunes Santos',
      124: 'Rayanne Maria dos Santos Moca',
    },
  },
  {
    store: 'Loja Teotonio Vilela', approver: KEMILLY_ID, employees: {
      51: 'Eliene Da Silva Santos',
      120: 'Jayane da Silva Dias',
      105: 'Josenildo Alves',
      106: 'Shayane Ferreira',
      50: 'Camille Kauane Da Silva Nunes', // sem ponto
    },
  },
  {
    store: 'Loja Penedo', approver: MARIANE_ID, employees: {
      64: 'Anny Karoline Andrade Santos',
      56: 'Deise Gislaine Silva vitor',
      103: 'Maria Fernanda Gomes Vieira',
    },
  },
];

async function main() {
  console.log(COMMIT ? '*** MODO COMMIT — vai gravar no Firestore ***' : '*** DRY-RUN (use --commit para gravar) ***');
  const action = CLEAR ? 'REMOVER o acesso de todas as lojas'
    : CLEAR_CORURIPE ? 'REMOVER o acesso da Kemilly à Loja Coruripe (Taciane voltou)'
    : 'Kemilly → Teotônio + Coruripe; Mariane → Penedo';
  console.log(`Ação: ${action}\n`);

  const leaders = new Map((await db.collection('leaders').get()).docs.map(d => [d.data().id, d.data()]));
  let abort = false;
  const updates: { id: string; value: number | null }[] = [];

  for (const { store, approver, employees } of STORES) {
    const remove = CLEAR || (CLEAR_CORURIPE && store === 'Loja Coruripe');
    const skip = CLEAR_CORURIPE && store !== 'Loja Coruripe';
    console.log(`${store} → ${leaders.get(approver)?.name ?? `?${approver}`} (leader ${approver})${skip ? ' — sem mudança' : ''}`);
    for (const [id, name] of Object.entries(employees)) {
      const x = (await db.collection('employees').doc(id).get()).data();
      if (!x) { console.log(`  ❌ employees/${id} não existe`); abort = true; continue; }
      if (x.name !== name) { console.log(`  ❌ employees/${id} é "${x.name}", esperado "${name}"`); abort = true; }
      if (x.leader_id !== TACIANE_ID) { console.log(`  ❌ employees/${id} (${name}) está com leader_id=${x.leader_id}, esperado ${TACIANE_ID}`); abort = true; }
      const current = x.secondary_approver_id ?? null;
      if (current !== null && current !== approver) {
        console.log(`  ❌ employees/${id} (${name}) já tem secondary_approver_id=${current}`); abort = true;
      }
      if (skip) continue;
      const target = remove ? null : approver;
      console.log(`  employees/${id} ${x.name}: secondary_approver_id ${current ?? '(vazio)'} → ${target ?? '(removido)'}`);
      if (current !== target) updates.push({ id, value: target });
    }
  }

  // Alguém novo no time da Taciane que não está em nenhuma loja acima?
  const listed = new Set(STORES.flatMap(s => Object.keys(s.employees)));
  const team = (await db.collection('employees').where('leader_id', '==', TACIANE_ID).get()).docs;
  const missing = team.filter(d => !listed.has(d.id));
  if (missing.length) {
    console.log('\n⚠ Do time da Taciane, sem loja neste script (ficam só com a Taciane):');
    missing.forEach(d => console.log(`  employees/${d.id} ${d.data().name}`));
  }

  if (abort) { console.log('\nProblema detectado. Nada foi gravado.'); process.exit(1); }
  if (updates.length === 0) { console.log('\nNada a mudar.'); process.exit(0); }
  if (!COMMIT) { console.log(`\nDRY-RUN: ${updates.length} colaborador(es) mudariam. Nada gravado. Rode novamente com --commit.`); process.exit(0); }

  const batch = db.batch();
  for (const { id, value } of updates) {
    batch.update(db.collection('employees').doc(id), {
      secondary_approver_id: value === null ? FieldValue.delete() : value,
    });
  }
  await batch.commit();
  console.log(`\n✓ ${updates.length} colaborador(es) gravados`);

  await db.collection('audit_log').add({
    action: 'ADMIN_BATCH_UPDATE',
    actor: 'script:set-store-secondary-approvers-oct2026',
    timestamp: new Date().toISOString(),
    details: `secondary_approver_id (${action}): ` +
      updates.map(u => `emp ${u.id} → ${u.value ?? 'removido'}`).join(', '),
  });
  console.log('✓ auditoria gravada');

  console.log('\n=== Verificação ===');
  for (const { id } of updates) {
    const x = (await db.collection('employees').doc(id).get()).data()!;
    console.log(`  employees/${id} ${x.name} → leader_id=${x.leader_id}, secondary_approver_id=${x.secondary_approver_id ?? '(vazio)'}`);
  }
  console.log('\nCache de cadastro leva até 30 min p/ refletir no painel.');
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
