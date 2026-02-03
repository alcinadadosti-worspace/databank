/**
 * Seed script: Import organizational hierarchy from Excel file.
 *
 * Run: npx tsx scripts/seed.ts
 */

import path from 'path';
import { getDb, closeDb } from '../src/models/database';
import * as queries from '../src/models/queries';

// Using xlsx library
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

function seed(): void {
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

  const db = getDb();

  // Clear existing data
  db.exec('DELETE FROM justifications');
  db.exec('DELETE FROM daily_records');
  db.exec('DELETE FROM employees');
  db.exec('DELETE FROM users');
  db.exec('DELETE FROM leaders');

  // Collect unique leaders
  const leaderNames = new Map<string, { name: string; slackId: string | null }>();

  for (const row of hierarchyRows) {
    let leaderName = row.lider_nome;
    // Handle "Leidiane Souza.1" → keep as distinct entry for second sector
    const normalizedName = leaderName.replace(/\.1$/, '').toLowerCase();

    // Use the original name for display, normalized for lookups
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
    // Try to find this leader's Slack ID from collaborator data
    const slackId = data.slackId || slackIdsByName.get(data.name.toLowerCase()) || null;
    const normalizedKey = key.replace(/\.1$/, '').toLowerCase();

    const result = queries.insertLeader(data.name, normalizedKey, slackId);
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
      // Find the secondary approver leader ID
      for (const [key, id] of leaderIdMap) {
        const leaderData = leaderNames.get(key);
        if (leaderData && leaderData.name.toLowerCase() === row.aprovador_secundario.toLowerCase()) {
          secondaryApproverId = id;
          break;
        }
      }
    }

    queries.insertEmployee(
      row.colaborador_nome!,
      row.colaborador_slack_id || null,
      leaderId,
      secondaryApproverId
    );
    employeeCount++;
  }

  // Create users for leaders and employees
  const allLeaders = queries.getAllLeaders();
  for (const leader of allLeaders) {
    if (leader.slack_id) {
      queries.upsertUser(leader.slack_id, leader.name, 'manager', undefined, leader.id);
    }
  }

  const allEmployees = queries.getAllEmployees();
  for (const emp of allEmployees) {
    if (emp.slack_id) {
      // Check if this employee is also a leader
      const isAlsoLeader = allLeaders.find(l => l.slack_id === emp.slack_id);
      queries.upsertUser(
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

  closeDb();
}

seed();
