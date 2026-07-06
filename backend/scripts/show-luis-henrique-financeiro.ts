import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();
const COMMIT = process.argv.includes('--commit');
const EMP_ID = '70';

function norm(s: string) {
  return (s || '').toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/\s+/g, ' ').trim();
}

async function main() {
  console.log(COMMIT ? '*** MODO COMMIT — vai gravar no Firestore ***\n' : '*** DRY-RUN (use --commit para gravar) ***\n');

  const ref = db.collection('employees').doc(EMP_ID);
  const snap = await ref.get();
  if (!snap.exists) throw new Error(`employees/${EMP_ID} não existe — abortando`);
  const emp = snap.data() as any;

  // Pré-condições: garante que é a pessoa certa, no setor certo, com o slack certo.
  if (!norm(emp.name).includes('luis henrique')) {
    throw new Error(`PRÉ-CONDIÇÃO FALHOU: employees/${EMP_ID} tem nome "${emp.name}", esperado conter "Luís Henrique" — abortando`);
  }
  if (emp.leader_id !== 13) {
    throw new Error(`PRÉ-CONDIÇÃO FALHOU: leader_id=${emp.leader_id}, esperado 13 (Financeiro) — abortando`);
  }
  if (emp.slack_id !== 'U097B39GTMG') {
    throw new Error(`PRÉ-CONDIÇÃO FALHOU: slack_id=${emp.slack_id}, esperado U097B39GTMG — abortando`);
  }

  console.log('Registro atual:');
  console.log(JSON.stringify(emp, null, 2));
  console.log();

  if (emp.no_punch_required !== true) {
    console.log(`no_punch_required já é ${JSON.stringify(emp.no_punch_required)} (não é true).`);
    console.log('Nada a alterar — ele já é agrupado sob Financeiro/Administrativo no painel.');
    process.exit(0);
  }

  console.log('Mudança planejada:  no_punch_required: true -> false');
  console.log('Efeito:');
  console.log('  • sai da unidade virtual "Sem Ponto" e passa a aparecer sob "Financeiro/Administrativo" (líder 13);');
  console.log('  • jornada padrão passa a valer: 480 min seg-sex / 240 min sábado (igual aos demais do Financeiro);');
  console.log('  • passa a receber lembretes de ponto e a entrar nos alertas de atraso/falta do gestor.\n');

  if (!COMMIT) { console.log('DRY-RUN: nada gravado. Rode novamente com --commit.'); process.exit(0); }

  const now = new Date().toISOString();
  await ref.update({ no_punch_required: false });
  await db.collection('audit_log').add({
    action: 'ADMIN_UPDATE',
    actor: 'script:show-luis-henrique-financeiro',
    timestamp: now,
    details: 'employees/70 (Luís Henrique Batista dos Santos): no_punch_required true -> false, ' +
      'para exibir sob Financeiro/Administrativo (líder 13) no painel e passar a cobrar ponto.',
  });

  const after = await ref.get();
  console.log('✓ Atualizado. Registro agora:');
  console.log(JSON.stringify(after.data(), null, 2));
  console.log('\nConcluído.');
  process.exit(0);
}

main().catch(e => { console.error('\nABORTADO:', e.message || e); process.exit(1); });
