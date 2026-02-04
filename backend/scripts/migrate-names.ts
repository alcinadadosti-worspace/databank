/**
 * Migration script: Fix employee and leader names in Firestore to match
 * the Sólides API exactly, and link solides_employee_id for each employee.
 *
 * This script does NOT delete any data — it only updates names and IDs.
 *
 * Run: npx tsx scripts/migrate-names.ts
 */

import path from 'path';
import { getDb, COLLECTIONS } from '../src/models/database';
import * as queries from '../src/models/queries';
import * as XLSX from 'xlsx';

const SOLIDES_IDS_PATH = path.resolve(__dirname, '../../ID_solides_ID_slack.xlsx');

interface SolidesMapping {
  id_solides: number;
  Nome: string;
  id_slack: string | null;
}

async function migrate(): Promise<void> {
  console.log('[migrate] Starting name migration...');

  // Load Sólides ID mapping spreadsheet
  const workbook = XLSX.readFile(SOLIDES_IDS_PATH);
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const mappings: SolidesMapping[] = XLSX.utils.sheet_to_json(sheet);

  // Build lookup maps
  const slackToSolidesId = new Map<string, string>();
  const slackToApiName = new Map<string, string>();
  for (const row of mappings) {
    if (row.id_slack) {
      slackToSolidesId.set(row.id_slack, String(row.id_solides));
      slackToApiName.set(row.id_slack, row.Nome);
    }
  }

  console.log(`[migrate] Loaded ${mappings.length} Sólides mappings (${slackToSolidesId.size} with Slack IDs)`);

  // ── Update Employees ──────────────────────────────────────────

  const employees = await queries.getAllEmployees();
  let empUpdated = 0;
  let empLinked = 0;

  for (const emp of employees) {
    if (!emp.slack_id) continue;

    const apiName = slackToApiName.get(emp.slack_id);
    const solidesId = slackToSolidesId.get(emp.slack_id);

    const nameChanged = apiName && apiName !== emp.name;
    const needsLink = solidesId && emp.solides_employee_id !== solidesId;

    if (nameChanged || needsLink) {
      await queries.updateEmployeeNameAndSolidesId(
        emp.id,
        apiName || emp.name,
        needsLink ? solidesId! : null
      );

      if (nameChanged) {
        console.log(`[migrate] Employee #${emp.id}: "${emp.name}" → "${apiName}"`);
        empUpdated++;
      }
      if (needsLink) {
        console.log(`[migrate] Employee #${emp.id}: linked solides_id=${solidesId}`);
        empLinked++;
      }
    }
  }

  // ── Update Leaders ────────────────────────────────────────────

  const leaders = await queries.getAllLeaders();
  let leaderUpdated = 0;

  for (const leader of leaders) {
    if (!leader.slack_id) continue;

    const apiName = slackToApiName.get(leader.slack_id);
    if (apiName && apiName !== leader.name) {
      await queries.updateLeaderName(leader.id, apiName, apiName.toLowerCase());
      console.log(`[migrate] Leader #${leader.id}: "${leader.name}" → "${apiName}"`);
      leaderUpdated++;
    }
  }

  // ── Update Users collection (names should match) ──────────────

  const db = getDb();
  const usersSnap = await db.collection(COLLECTIONS.USERS).get();
  let usersUpdated = 0;

  for (const doc of usersSnap.docs) {
    const user = doc.data();
    if (!user.slack_id) continue;

    const apiName = slackToApiName.get(user.slack_id);
    if (apiName && apiName !== user.name) {
      await doc.ref.update({ name: apiName });
      console.log(`[migrate] User "${user.name}" → "${apiName}"`);
      usersUpdated++;
    }
  }

  // ── Summary ───────────────────────────────────────────────────

  console.log(`\n[migrate] Done!`);
  console.log(`[migrate] Employees updated: ${empUpdated} names, ${empLinked} Sólides IDs linked`);
  console.log(`[migrate] Leaders updated: ${leaderUpdated}`);
  console.log(`[migrate] Users updated: ${usersUpdated}`);

  await queries.logAudit('MIGRATION', 'system', undefined,
    `Name migration: ${empUpdated} employees, ${leaderUpdated} leaders, ${empLinked} Sólides IDs`);
}

migrate().catch(err => {
  console.error('[migrate] Fatal error:', err);
  process.exit(1);
});
