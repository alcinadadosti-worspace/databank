/**
 * Exclui os 4 pedidos de ajuste pendentes de 10/11/2026 (Ana Paula #1311/#1312, Rayanne #1315/#1316).
 * O dia já foi corrigido com a saída da Sólides (resync-silent-coruripe-nov10.ts), então os pedidos
 * perderam o motivo. Mesmo efeito do DELETE /api/punch-adjustments/:id: apaga o pedido e grava
 * PUNCH_ADJUSTMENT_DELETED; não mexe no daily_record e não manda Slack.
 *
 *   npx tsx scripts/delete-adjustments-coruripe-nov10.ts            # teste: só confere
 *   npx tsx scripts/delete-adjustments-coruripe-nov10.ts --commit   # exclui
 */
import 'dotenv/config';
import * as queries from '../src/models/queries';
import { getFirestore } from 'firebase-admin/firestore';

const DATE = '2026-11-10';
const EXPECTED: Record<number, number> = { 1311: 63, 1312: 63, 1315: 124, 1316: 124 };

async function main() {
  // Garante que o firebase-admin está inicializado pelo app antes de usar o Firestore direto
  await queries.getAllEmployees();
  const db = getFirestore();
  for (const [idStr, empId] of Object.entries(EXPECTED)) {
    const id = Number(idStr);
    const snap = await db.collection('punch_adjustments').where('id', '==', id).limit(1).get();
    if (snap.empty) throw new Error(`#${id} não existe — parei sem excluir nada`);
    const a = snap.docs[0].data() as any;
    const rec = await queries.getDailyRecordById(a.daily_record_id);
    console.log(`#${id}: emp ${a.employee_id} | status ${a.status} | dia ${rec?.date} | registro agora ${rec?.punch_1} ${rec?.punch_2} ${rec?.punch_3} ${rec?.punch_4} ${rec?.classification} | faltando ${JSON.stringify(a.missing_punches)} | campos: ${Object.keys(a).sort().join(',')}`);
    if (a.employee_id !== empId || a.status !== 'pending' || rec?.date !== DATE || !rec?.punch_4) {
      throw new Error(`#${id} não confere (colaborador, status, dia ou saída) — parei sem excluir nada`);
    }
  }

  if (!process.argv.includes('--commit')) {
    console.log('\nTudo confere. Nada foi excluído (use --commit).');
    return;
  }

  for (const id of Object.keys(EXPECTED).map(Number)) {
    const deleted = await queries.deletePunchAdjustment(id);
    if (!deleted) throw new Error(`#${id} sumiu antes de excluir`);
    await queries.logAudit('PUNCH_ADJUSTMENT_DELETED', 'punch_adjustment', id,
      'Deleted (script): dia 10/11 corrigido pela Sólides, REP de Coruripe enviou a saída depois das 10:00');
    console.log(`#${id} excluído`);
  }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
