/**
 * Seed script: Import organizational hierarchy from Excel file into Firestore.
 *
 * Run: npx tsx scripts/seed.ts
 */

import path from 'path';
import { getDb, COLLECTIONS } from '../src/models/database';
import * as queries from '../src/models/queries';
import * as XLSX from 'xlsx';

const EXCEL_PATH = path.resolve(__dirname, '../../mapeamento_final_com_slack.xlsx');

interface ExcelRow {
  lider_nome: string;
  colaborador_nome?: string;
  colaborador_slack_id?: string;
  lider_nome_norm?: string;
  lider_slack_id?: string | null;
  aprovador_secundario?: string | null;
}

async function seed(): Promise<void> {
  console.log('[seed] Starting database seed...');
  console.log(`[seed] Reading ${EXCEL_PATH}`);

  const workbook = XLSX.readFile(EXCEL_PATH);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData: any[] = XLSX.utils.sheet_to_json(sheet);

  // Filter only rows with colaborador_nome (hierarchy data, not summary)
  const hierarchyRows: ExcelRow[] = rawData.filter(
    (row: any) => row.colaborador_nome && typeof row.colaborador_nome === 'string'
  );

  console.log(`[seed] Found ${hierarchyRows.length} hierarchy records`);

  // Clear existing data
  console.log('[seed] Clearing existing Firestore data...');
  const db = getDb();
  const collections = [
    COLLECTIONS.JUSTIFICATIONS,
    COLLECTIONS.DAILY_RECORDS,
    COLLECTIONS.EMPLOYEES,
    COLLECTIONS.USERS,
    COLLECTIONS.LEADERS,
    COLLECTIONS.COUNTERS,
    COLLECTIONS.AUDIT_LOG,
  ];
  for (const col of collections) {
    const snap = await db.collection(col).get();
    if (snap.size > 0) {
      const batch = db.batch();
      let count = 0;
      for (const doc of snap.docs) {
        batch.delete(doc.ref);
        count++;
        // Firestore batch max 500
        if (count >= 490) {
          await batch.commit();
          count = 0;
        }
      }
      if (count > 0) await batch.commit();
      console.log(`[seed] Cleared ${snap.size} docs from ${col}`);
    }
  }

  // Collect unique leaders
  const leaderNames = new Map<string, { name: string; slackId: string | null }>();

  for (const row of hierarchyRows) {
    let leaderName = row.lider_nome;

    if (!leaderNames.has(leaderName)) {
      leaderNames.set(leaderName, {
        name: leaderName.replace(/\.1$/, ''), // Display name without .1
        slackId: row.lider_slack_id || null,
      });
    }
  }

  // Cross-reference: some leaders appear as collaborators in other rows
  const slackIdsByName = new Map<string, string>();
  for (const row of hierarchyRows) {
    if (row.colaborador_slack_id && row.colaborador_nome) {
      slackIdsByName.set(row.colaborador_nome.toLowerCase(), row.colaborador_slack_id);
    }
  }

  // Insert leaders
  const leaderIdMap = new Map<string, number>();
  for (const [key, data] of leaderNames) {
    const slackId = data.slackId || slackIdsByName.get(data.name.toLowerCase()) || null;
    const normalizedKey = key.replace(/\.1$/, '').toLowerCase();

    const result = await queries.insertLeader(data.name, normalizedKey, slackId);
    leaderIdMap.set(key, result.lastInsertRowid as number);

    console.log(`[seed] Leader: ${data.name} (ID: ${result.lastInsertRowid}, Slack: ${slackId || 'N/A'}) [key: ${key}]`);
  }

  // Insert employees
  let employeeCount = 0;
  for (const row of hierarchyRows) {
    const leaderId = leaderIdMap.get(row.lider_nome);
    if (!leaderId) {
      console.warn(`[seed] Leader not found for: ${row.lider_nome}`);
      continue;
    }

    // Handle secondary approver (Suzana Tavares for Ravy Thiago's team)
    let secondaryApproverId: number | null = null;
    if (row.aprovador_secundario) {
      for (const [key, id] of leaderIdMap) {
        const leaderData = leaderNames.get(key);
        if (leaderData && leaderData.name.toLowerCase() === row.aprovador_secundario.toLowerCase()) {
          secondaryApproverId = id;
          break;
        }
      }
    }

    await queries.insertEmployee(
      row.colaborador_nome!,
      row.colaborador_slack_id || null,
      leaderId,
      secondaryApproverId
    );
    employeeCount++;
  }

  // Create users for leaders and employees
  const allLeaders = await queries.getAllLeaders();
  for (const leader of allLeaders) {
    if (leader.slack_id) {
      await queries.upsertUser(leader.slack_id, leader.name, 'manager', undefined, leader.id);
    }
  }

  const allEmployees = await queries.getAllEmployees();
  for (const emp of allEmployees) {
    if (emp.slack_id) {
      const isAlsoLeader = allLeaders.find(l => l.slack_id === emp.slack_id);
      await queries.upsertUser(
        emp.slack_id,
        emp.name,
        isAlsoLeader ? 'manager' : 'employee',
        emp.id,
        isAlsoLeader ? isAlsoLeader.id : undefined
      );
    }
  }

  console.log(`\n[seed] Done!`);
  console.log(`[seed] Leaders: ${leaderNames.size}`);
  console.log(`[seed] Employees: ${employeeCount}`);
  console.log(`[seed] Users created: ${allLeaders.filter(l => l.slack_id).length + allEmployees.filter(e => e.slack_id).length}`);
}

seed().catch(err => {
  console.error('[seed] Fatal error:', err);
  process.exit(1);
});
