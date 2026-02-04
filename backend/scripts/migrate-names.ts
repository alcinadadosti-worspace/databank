/**
 * Migration script: Fix employee and leader names in Firestore to match
 * the Sólides API exactly, link solides_employee_id, and set leader Slack IDs.
 *
 * This script does NOT delete any data — it only updates names, IDs, and Slack IDs.
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

// Leader name → Slack ID mapping
const LEADER_SLACK_IDS: Record<string, string> = {
  'Alberto Luiz Marinho Batista': 'U07KXEJU338',
  'Ana Clara de Matos Chagas': 'U08F9KK0AAG',
  'Erick Café Santos Júnior': 'U07KPE840MD',
  'Joao Antonio Tavares Santos': 'U07LP4JSN9K',
  'Jonathan Henrique da Conceição Silva': 'U07L4D3EWJW',
  'Kemilly Rafaelly Souza Silva': 'U087HDEARA9',
  'Leidiane Souza': 'U07KX76F7D4',
  'Mariane Santos Sousa': 'U088B372R40',
  'Michaell Jean Nunes De Carvalho': 'U07P692F1FB',
  'Rafaela Alves Mendes': 'U07KP9J5BLP',
  'Rafaela Mendes': 'U07KP9J5BLP',
  'Ravy Thiago Vieira Da Silva': 'U07Q8NT7J1Y',
  'Romulo Jose Santos Lisboa': 'U07LSKN7SNL',
  'Rômulo Lisboa': 'U07LSKN7SNL',
  'Suzana Martins Tavares': 'U09F9LWM6MC',
  'Suzana Tavares': 'U09F9LWM6MC',
  'Maria Taciane Pereira Barbosa': 'U07L6EAUS75',
  'Carlos Eduardo Silva De Oliveira': 'U0895CZ8HU7',
  'Carlos Oliveira': 'U0895CZ8HU7',
};

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

  // ── Update Leaders (name + slack_id) ──────────────────────────

  const leaders = await queries.getAllLeaders();
  let leaderUpdated = 0;
  let leaderSlackSet = 0;

  // Build a normalized lookup for leader slack IDs
  const leaderSlackByNorm = new Map<string, string>();
  for (const [name, slackId] of Object.entries(LEADER_SLACK_IDS)) {
    leaderSlackByNorm.set(name.toLowerCase(), slackId);
  }

  for (const leader of leaders) {
    // Update name if leader has slack_id and we have an API name for it
    if (leader.slack_id) {
      const apiName = slackToApiName.get(leader.slack_id);
      if (apiName && apiName !== leader.name) {
        await queries.updateLeaderName(leader.id, apiName, apiName.toLowerCase());
        console.log(`[migrate] Leader #${leader.id}: "${leader.name}" → "${apiName}"`);
        leaderUpdated++;
      }
    }

    // Set slack_id if leader doesn't have one yet
    const cleanName = leader.name.replace(/\.1$/, '');
    const expectedSlack = leaderSlackByNorm.get(cleanName.toLowerCase());
    if (expectedSlack && leader.slack_id !== expectedSlack) {
      await queries.updateLeaderSlackId(leader.id, expectedSlack);
      console.log(`[migrate] Leader #${leader.id} "${leader.name}": slack_id=${expectedSlack}`);
      leaderSlackSet++;
    }
  }

  // ── Update Users collection (names + ensure leaders have user records) ──

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

  // Ensure all leaders with slack IDs have user records
  const updatedLeaders = await queries.getAllLeaders();
  const updatedEmployees = await queries.getAllEmployees();
  for (const leader of updatedLeaders) {
    if (leader.slack_id) {
      const isAlsoEmployee = updatedEmployees.find(e => e.slack_id === leader.slack_id);
      await queries.upsertUser(
        leader.slack_id,
        leader.name,
        'manager',
        isAlsoEmployee ? isAlsoEmployee.id : undefined,
        leader.id
      );
    }
  }

  // ── Summary ───────────────────────────────────────────────────

  console.log(`\n[migrate] Done!`);
  console.log(`[migrate] Employees: ${empUpdated} names updated, ${empLinked} Sólides IDs linked`);
  console.log(`[migrate] Leaders: ${leaderUpdated} names updated, ${leaderSlackSet} Slack IDs set`);
  console.log(`[migrate] Users: ${usersUpdated} names updated`);

  await queries.logAudit('MIGRATION', 'system', undefined,
    `Migration: ${empUpdated} emp names, ${empLinked} solides IDs, ${leaderSlackSet} leader slack IDs`);
}

migrate().catch(err => {
  console.error('[migrate] Fatal error:', err);
  process.exit(1);
});
