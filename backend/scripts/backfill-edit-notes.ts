import 'dotenv/config';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (getApps().length === 0) {
  const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64!, 'base64').toString('utf8'));
  initializeApp({ credential: cert(sa) });
}

const db = getFirestore();
const COMMIT = process.argv.includes('--commit');

// Copia o motivo das edições manuais antigas (lápis do gestor/RH e lançamento manual),
// que até out/2026 só ficava no audit_log (MANUAL_PUNCH_EDIT), para o próprio registro
// (edit_note / edited_by / edited_at) — assim o RH vê o motivo na aba Registros.
//  - Vale a edição mais recente de cada registro.
//  - Motivos padrão ("Correção manual" / "Lançamento manual de ponto") = nada digitado → edit_note null.
//  - Registro que já tem edited_by (editado depois do deploy) não é tocado.
const DEFAULT_REASONS = new Set(['Correção manual', 'Lançamento manual de ponto']);

interface LatestEdit {
  recordId: number;
  note: string | null;
  editedBy: string;
  editedAt: string;
  date?: string;
  employeeId?: number;
}

async function main() {
  console.log(COMMIT ? '*** MODO COMMIT — vai gravar no Firestore ***' : '*** DRY-RUN (use --commit para gravar) ***\n');

  const logs = await db.collection('audit_log').where('action', '==', 'MANUAL_PUNCH_EDIT').get();
  console.log(`audit_log MANUAL_PUNCH_EDIT: ${logs.size} entradas`);

  const latest = new Map<number, LatestEdit>();
  let unparsable = 0;
  for (const doc of logs.docs) {
    const log = doc.data();
    if (!log.entity_id) { unparsable++; continue; }
    let details: any;
    try { details = JSON.parse(log.details || '{}'); } catch { unparsable++; continue; }
    const reason = typeof details.reason === 'string' ? details.reason.trim() : '';
    const edit: LatestEdit = {
      recordId: Number(log.entity_id),
      note: reason && !DEFAULT_REASONS.has(reason) ? reason.slice(0, 500) : null,
      editedBy: details.editedBy === 'admin' ? 'RH' : (details.editedBy || 'gestor'),
      editedAt: log.created_at,
      date: details.date,
      employeeId: details.employeeId,
    };
    const prev = latest.get(edit.recordId);
    if (!prev || prev.editedAt < edit.editedAt) latest.set(edit.recordId, edit);
  }
  if (unparsable) console.log(`(ignoradas ${unparsable} entradas sem record id / JSON inválido)`);
  console.log(`Registros distintos editados: ${latest.size}\n`);

  let toWrite = 0, withNote = 0, alreadySet = 0, missing = 0;
  const batchSize = 400;
  let batch = db.batch();
  let pending = 0;

  for (const edit of Array.from(latest.values()).sort((a, b) => a.editedAt.localeCompare(b.editedAt))) {
    const snap = await db.collection('daily_records').where('id', '==', edit.recordId).limit(1).get();
    if (snap.empty) { missing++; continue; }
    const rec = snap.docs[0].data();
    if (rec.edited_by) { alreadySet++; continue; }

    toWrite++;
    if (edit.note) withNote++;
    console.log(`  rec ${edit.recordId} | ${rec.date} | emp ${rec.employee_id} | por ${edit.editedBy} em ${edit.editedAt.slice(0, 16)} | ${edit.note ?? '(sem motivo)'}`);

    if (COMMIT) {
      batch.update(snap.docs[0].ref, {
        edit_note: edit.note,
        edit_note_by: edit.note ? edit.editedBy : null,
        edited_by: edit.editedBy,
        edited_at: edit.editedAt,
      });
      if (++pending >= batchSize) { await batch.commit(); batch = db.batch(); pending = 0; }
    }
  }
  if (COMMIT && pending > 0) await batch.commit();

  console.log(`\nA gravar: ${toWrite} (com motivo digitado: ${withNote}, sem motivo: ${toWrite - withNote})`);
  console.log(`Já tinham edited_by (não tocados): ${alreadySet}`);
  console.log(`Registro não encontrado (apagado): ${missing}`);
  console.log(COMMIT ? '\n✅ Gravado.' : '\nNada gravado (dry-run).');
}

main().catch(err => { console.error(err); process.exit(1); });
