import { getDb, COLLECTIONS, getNextId } from './database';
import { FieldValue } from 'firebase-admin/firestore';

// Helper: convert Firestore doc to plain object with id
function docToObj<T>(doc: FirebaseFirestore.DocumentSnapshot): T | undefined {
  if (!doc.exists) return undefined;
  return { ...doc.data(), _docId: doc.id } as unknown as T;
}

function docsToArray<T>(snapshot: FirebaseFirestore.QuerySnapshot): T[] {
  return snapshot.docs.map(doc => ({ ...doc.data(), _docId: doc.id }) as unknown as T);
}

// In-memory caches for leaders/employees (refreshed on insert)
let leadersCache: Leader[] | null = null;
let employeesCache: EmployeeWithLeader[] | null = null;

function invalidateCaches() {
  leadersCache = null;
  employeesCache = null;
}

// ─── Leaders ───────────────────────────────────────────────────

export async function getAllLeaders(): Promise<Leader[]> {
  if (leadersCache) return leadersCache;
  const snap = await getDb().collection(COLLECTIONS.LEADERS).orderBy('name').get();
  leadersCache = docsToArray<Leader>(snap);
  return leadersCache;
}

export async function getLeaderById(id: number): Promise<Leader | undefined> {
  const leaders = await getAllLeaders();
  return leaders.find(l => l.id === id);
}

export async function getLeaderBySlackId(slackId: string): Promise<Leader | undefined> {
  const leaders = await getAllLeaders();
  return leaders.find(l => l.slack_id === slackId);
}

export async function getLeaderByName(name: string): Promise<Leader | undefined> {
  const leaders = await getAllLeaders();
  return leaders.find(l => l.name_normalized === name.toLowerCase());
}

export async function insertLeader(name: string, nameNormalized: string, slackId: string | null) {
  const id = await getNextId(COLLECTIONS.LEADERS);
  const data = {
    id,
    name,
    name_normalized: nameNormalized,
    slack_id: slackId,
    created_at: new Date().toISOString(),
  };
  await getDb().collection(COLLECTIONS.LEADERS).doc(String(id)).set(data);
  invalidateCaches();
  return { lastInsertRowid: id };
}

// ─── Employees ─────────────────────────────────────────────────

export async function getAllEmployees(): Promise<EmployeeWithLeader[]> {
  if (employeesCache) return employeesCache;
  const leaders = await getAllLeaders();
  const leaderMap = new Map(leaders.map(l => [l.id, l]));

  const snap = await getDb().collection(COLLECTIONS.EMPLOYEES).orderBy('name').get();
  const employees = docsToArray<Employee>(snap);

  employeesCache = employees.map(e => {
    const leader = leaderMap.get(e.leader_id);
    return {
      ...e,
      leader_name: leader?.name ?? '',
      leader_slack_id: leader?.slack_id ?? null,
      sector: leader?.sector ?? null,
    };
  });
  return employeesCache;
}

export async function getEmployeesByLeaderId(leaderId: number): Promise<EmployeeWithLeader[]> {
  const all = await getAllEmployees();
  return all.filter(e => e.leader_id === leaderId || e.secondary_approver_id === leaderId);
}

export async function getEmployeeBySlackId(slackId: string): Promise<Employee | undefined> {
  const all = await getAllEmployees();
  return all.find(e => e.slack_id === slackId);
}

export async function getEmployeeById(id: number): Promise<Employee | undefined> {
  const all = await getAllEmployees();
  return all.find(e => e.id === id);
}

export async function insertEmployee(
  name: string,
  slackId: string | null,
  leaderId: number,
  secondaryApproverId: number | null
) {
  const id = await getNextId(COLLECTIONS.EMPLOYEES);
  const data = {
    id,
    name,
    slack_id: slackId,
    leader_id: leaderId,
    secondary_approver_id: secondaryApproverId,
    solides_employee_id: null,
    created_at: new Date().toISOString(),
  };
  await getDb().collection(COLLECTIONS.EMPLOYEES).doc(String(id)).set(data);
  invalidateCaches();
  return { lastInsertRowid: id };
}

export async function updateEmployeeSolidesId(employeeId: number, solidesId: string) {
  await getDb().collection(COLLECTIONS.EMPLOYEES).doc(String(employeeId)).update({
    solides_employee_id: solidesId,
  });
  invalidateCaches();
}

export async function setApprentice(employeeId: number, isApprentice: boolean, expectedMinutes: number) {
  await getDb().collection(COLLECTIONS.EMPLOYEES).doc(String(employeeId)).update({
    is_apprentice: isApprentice,
    expected_daily_minutes: expectedMinutes,
  });
  invalidateCaches();
}

export async function updateEmployeeNameAndSolidesId(
  employeeId: number,
  name: string,
  solidesId: string | null
) {
  const data: Record<string, any> = { name };
  if (solidesId !== null) {
    data.solides_employee_id = solidesId;
  }
  await getDb().collection(COLLECTIONS.EMPLOYEES).doc(String(employeeId)).update(data);
  invalidateCaches();
}

export async function updateLeaderName(leaderId: number, name: string, nameNormalized: string) {
  await getDb().collection(COLLECTIONS.LEADERS).doc(String(leaderId)).update({
    name,
    name_normalized: nameNormalized,
  });
  invalidateCaches();
}

export async function updateLeaderSlackId(leaderId: number, slackId: string) {
  await getDb().collection(COLLECTIONS.LEADERS).doc(String(leaderId)).update({
    slack_id: slackId,
  });
  invalidateCaches();
}

export async function updateLeaderSector(leaderId: number, sector: string, parentLeaderId: number | null) {
  await getDb().collection(COLLECTIONS.LEADERS).doc(String(leaderId)).update({
    sector,
    parent_leader_id: parentLeaderId,
  });
  invalidateCaches();
}

export async function getLeadersBySector(sector: string): Promise<Leader[]> {
  const all = await getAllLeaders();
  return all.filter(l => l.sector === sector);
}

export async function getEmployeesBySector(sector: string): Promise<EmployeeWithLeader[]> {
  const leaders = await getLeadersBySector(sector);
  const leaderIds = new Set(leaders.map(l => l.id));
  const all = await getAllEmployees();
  return all.filter(e => leaderIds.has(e.leader_id));
}

// ─── Daily Records ─────────────────────────────────────────────

// Composite key for daily_records: "employeeId_date"
function dailyRecordDocId(employeeId: number, date: string): string {
  return `${employeeId}_${date}`;
}

export async function getDailyRecord(employeeId: number, date: string): Promise<DailyRecord | undefined> {
  const docId = dailyRecordDocId(employeeId, date);
  const doc = await getDb().collection(COLLECTIONS.DAILY_RECORDS).doc(docId).get();
  return docToObj<DailyRecord>(doc);
}

export async function getDailyRecordsByDate(date: string): Promise<DailyRecordFull[]> {
  const snap = await getDb().collection(COLLECTIONS.DAILY_RECORDS)
    .where('date', '==', date).get();
  const records = docsToArray<DailyRecord>(snap);

  const employees = await getAllEmployees();
  const empMap = new Map(employees.map(e => [e.id, e]));

  return records.map(r => {
    const emp = empMap.get(r.employee_id);
    return {
      ...r,
      employee_name: emp?.name ?? '',
      employee_slack_id: emp?.slack_id ?? null,
      leader_name: emp?.leader_name ?? '',
      leader_slack_id: emp?.leader_slack_id ?? null,
      leader_id: emp?.leader_id ?? 0,
    };
  }).sort((a, b) => a.employee_name.localeCompare(b.employee_name));
}

export async function getDailyRecordsByEmployeeRange(
  employeeId: number, startDate: string, endDate: string
): Promise<DailyRecordWithJustification[]> {
  const snap = await getDb().collection(COLLECTIONS.DAILY_RECORDS)
    .where('employee_id', '==', employeeId)
    .where('date', '>=', startDate)
    .where('date', '<=', endDate)
    .orderBy('date', 'desc')
    .get();
  const records = docsToArray<DailyRecord>(snap);

  // Get justifications for these records
  const justSnap = await getDb().collection(COLLECTIONS.JUSTIFICATIONS)
    .where('employee_id', '==', employeeId).get();
  const justMap = new Map<number, { reason: string; type: string }>();
  for (const doc of justSnap.docs) {
    const j = doc.data();
    justMap.set(j.daily_record_id, { reason: j.reason, type: j.type });
  }

  return records.map(r => ({
    ...r,
    justification_reason: justMap.get(r.id)?.reason ?? null,
    justification_type: justMap.get(r.id)?.type ?? null,
  }));
}

export async function getDailyRecordsByLeaderRange(
  leaderId: number, startDate: string, endDate: string
): Promise<DailyRecordFull[]> {
  const employees = await getEmployeesByLeaderId(leaderId);
  const empIds = employees.map(e => e.id);
  if (empIds.length === 0) return [];

  // Query by date range only, then filter by employee IDs in memory
  // (avoids Firestore composite index requirement for 'in' + range)
  const empIdSet = new Set(empIds);
  const snap = await getDb().collection(COLLECTIONS.DAILY_RECORDS)
    .where('date', '>=', startDate)
    .where('date', '<=', endDate)
    .get();
  const allRecords = docsToArray<DailyRecord>(snap).filter(r => empIdSet.has(r.employee_id));

  // Get justifications
  const recordIds = allRecords.map(r => r.id);
  const justMap = await getJustificationsMap(recordIds);

  const empMap = new Map(employees.map(e => [e.id, e]));

  return allRecords
    .map(r => {
      const emp = empMap.get(r.employee_id);
      return {
        ...r,
        employee_name: emp?.name ?? '',
        employee_slack_id: emp?.slack_id ?? null,
        leader_name: emp?.leader_name ?? '',
        leader_slack_id: emp?.leader_slack_id ?? null,
        leader_id: emp?.leader_id ?? 0,
        justification_reason: justMap.get(r.id)?.reason ?? null,
        justification_type: justMap.get(r.id)?.type ?? null,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.employee_name.localeCompare(b.employee_name));
}

export async function getAllRecordsRange(startDate: string, endDate: string): Promise<DailyRecordFull[]> {
  const snap = await getDb().collection(COLLECTIONS.DAILY_RECORDS)
    .where('date', '>=', startDate)
    .where('date', '<=', endDate)
    .orderBy('date', 'desc')
    .get();
  const records = docsToArray<DailyRecord>(snap);

  const employees = await getAllEmployees();
  const empMap = new Map(employees.map(e => [e.id, e]));

  const recordIds = records.map(r => r.id);
  const justMap = await getJustificationsMap(recordIds);

  return records.map(r => {
    const emp = empMap.get(r.employee_id);
    return {
      ...r,
      employee_name: emp?.name ?? '',
      employee_slack_id: emp?.slack_id ?? null,
      leader_name: emp?.leader_name ?? '',
      leader_slack_id: emp?.leader_slack_id ?? null,
      leader_id: emp?.leader_id ?? 0,
      justification_reason: justMap.get(r.id)?.reason ?? null,
      justification_type: justMap.get(r.id)?.type ?? null,
    };
  }).sort((a, b) => b.date.localeCompare(a.date) || a.employee_name.localeCompare(b.employee_name));
}

export async function upsertDailyRecord(
  employeeId: number,
  date: string,
  punch1: string | null,
  punch2: string | null,
  punch3: string | null,
  punch4: string | null,
  totalWorkedMinutes: number | null,
  differenceMinutes: number | null,
  classification: string | null
) {
  const docId = dailyRecordDocId(employeeId, date);
  const ref = getDb().collection(COLLECTIONS.DAILY_RECORDS).doc(docId);
  const existing = await ref.get();
  const now = new Date().toISOString();

  if (existing.exists) {
    await ref.update({
      punch_1: punch1, punch_2: punch2, punch_3: punch3, punch_4: punch4,
      total_worked_minutes: totalWorkedMinutes,
      difference_minutes: differenceMinutes,
      classification,
      updated_at: now,
    });
  } else {
    const id = await getNextId(COLLECTIONS.DAILY_RECORDS);
    await ref.set({
      id,
      employee_id: employeeId,
      date,
      punch_1: punch1, punch_2: punch2, punch_3: punch3, punch_4: punch4,
      total_worked_minutes: totalWorkedMinutes,
      difference_minutes: differenceMinutes,
      classification,
      alert_sent: 0,
      manager_alert_sent: 0,
      created_at: now,
      updated_at: now,
    });
  }
}

export async function markAlertSent(recordId: number) {
  // Find the doc by numeric id
  const snap = await getDb().collection(COLLECTIONS.DAILY_RECORDS)
    .where('id', '==', recordId).limit(1).get();
  if (!snap.empty) {
    await snap.docs[0].ref.update({ alert_sent: 1 });
  }
}

export async function markManagerAlertSent(date: string) {
  const snap = await getDb().collection(COLLECTIONS.DAILY_RECORDS)
    .where('date', '==', date).get();
  const batch = getDb().batch();
  for (const doc of snap.docs) {
    batch.update(doc.ref, { manager_alert_sent: 1 });
  }
  await batch.commit();
}

export async function getUnalertedRecords(date: string): Promise<DailyRecordFull[]> {
  const snap = await getDb().collection(COLLECTIONS.DAILY_RECORDS)
    .where('date', '==', date)
    .where('alert_sent', '==', 0)
    .get();
  const records = docsToArray<DailyRecord>(snap);

  // Filter in-memory for classification and threshold
  const filtered = records.filter(
    r => (r.classification === 'late' || r.classification === 'overtime')
      && Math.abs(r.difference_minutes ?? 0) >= 11
  );

  const employees = await getAllEmployees();
  const empMap = new Map(employees.map(e => [e.id, e]));

  return filtered.map(r => {
    const emp = empMap.get(r.employee_id);
    return {
      ...r,
      employee_name: emp?.name ?? '',
      employee_slack_id: emp?.slack_id ?? null,
      leader_name: emp?.leader_name ?? '',
      leader_slack_id: emp?.leader_slack_id ?? null,
      leader_id: emp?.leader_id ?? 0,
    };
  });
}

// ─── Justifications ────────────────────────────────────────────

export async function insertJustification(
  dailyRecordId: number,
  employeeId: number,
  type: 'late' | 'overtime',
  reason: string,
  customNote?: string
) {
  const id = await getNextId(COLLECTIONS.JUSTIFICATIONS);
  await getDb().collection(COLLECTIONS.JUSTIFICATIONS).doc(String(id)).set({
    id,
    daily_record_id: dailyRecordId,
    employee_id: employeeId,
    type,
    reason,
    custom_note: customNote || null,
    submitted_at: new Date().toISOString(),
  });
}

export async function getJustificationsByEmployee(employeeId: number): Promise<JustificationWithDate[]> {
  const snap = await getDb().collection(COLLECTIONS.JUSTIFICATIONS)
    .where('employee_id', '==', employeeId).get();
  const justifications = docsToArray<any>(snap);

  // Get daily_record dates
  const recordIds = [...new Set(justifications.map(j => j.daily_record_id))];
  const dateMap = new Map<number, string>();

  for (const chunk of chunkArray(recordIds, 30)) {
    const rSnap = await getDb().collection(COLLECTIONS.DAILY_RECORDS)
      .where('id', 'in', chunk).get();
    for (const doc of rSnap.docs) {
      const data = doc.data();
      dateMap.set(data.id, data.date);
    }
  }

  return justifications
    .map(j => ({
      ...j,
      date: dateMap.get(j.daily_record_id) ?? '',
    }))
    .sort((a: any, b: any) => b.date.localeCompare(a.date));
}

// ─── Audit Log ─────────────────────────────────────────────────

export async function logAudit(action: string, entityType: string, entityId?: number, details?: string) {
  await getDb().collection(COLLECTIONS.AUDIT_LOG).add({
    action,
    entity_type: entityType,
    entity_id: entityId || null,
    details: details || null,
    created_at: new Date().toISOString(),
  });
}

export async function getAuditLogs(limit = 100, offset = 0) {
  const snap = await getDb().collection(COLLECTIONS.AUDIT_LOG)
    .orderBy('created_at', 'desc')
    .limit(limit + offset)
    .get();
  const all = docsToArray<AuditLog>(snap);
  return all.slice(offset, offset + limit);
}

// ─── Users ─────────────────────────────────────────────────────

export async function getUserBySlackId(slackId: string): Promise<User | undefined> {
  const snap = await getDb().collection(COLLECTIONS.USERS)
    .where('slack_id', '==', slackId).limit(1).get();
  if (snap.empty) return undefined;
  return { ...snap.docs[0].data(), _docId: snap.docs[0].id } as unknown as User;
}

export async function upsertUser(slackId: string, name: string, role: string, employeeId?: number, leaderId?: number) {
  const existing = await getUserBySlackId(slackId);
  if (existing) {
    const docId = (existing as any)._docId;
    await getDb().collection(COLLECTIONS.USERS).doc(docId).update({
      name, role,
      employee_id: employeeId || null,
      leader_id: leaderId || null,
    });
  } else {
    const id = await getNextId(COLLECTIONS.USERS);
    await getDb().collection(COLLECTIONS.USERS).doc(String(id)).set({
      id,
      slack_id: slackId,
      name,
      role,
      employee_id: employeeId || null,
      leader_id: leaderId || null,
      created_at: new Date().toISOString(),
    });
  }
}

// ─── Dashboard Stats ──────────────────────────────────────────

export async function getDashboardStats() {
  const today = new Date().toISOString().split('T')[0];

  const [employees, leaders, todaySnap, justSnap] = await Promise.all([
    getAllEmployees(),
    getAllLeaders(),
    getDb().collection(COLLECTIONS.DAILY_RECORDS).where('date', '==', today).get(),
    getDb().collection(COLLECTIONS.JUSTIFICATIONS).get(),
  ]);

  const todayRecords = docsToArray<DailyRecord>(todaySnap);
  const todayAlerts = todayRecords.filter(
    r => (r.classification === 'late' || r.classification === 'overtime')
      && Math.abs(r.difference_minutes ?? 0) >= 11
  );

  const justifiedRecordIds = new Set(justSnap.docs.map(d => d.data().daily_record_id));

  // Count all records with alerts but no justification
  const allRecordsSnap = await getDb().collection(COLLECTIONS.DAILY_RECORDS)
    .where('classification', 'in', ['late', 'overtime']).get();
  const pendingJustifications = allRecordsSnap.docs.filter(doc => {
    const data = doc.data();
    return Math.abs(data.difference_minutes ?? 0) >= 11
      && !justifiedRecordIds.has(data.id);
  }).length;

  return {
    total_employees: employees.length,
    total_leaders: leaders.length,
    today_records: todayRecords.length,
    today_alerts: todayAlerts.length,
    pending_justifications: pendingJustifications,
  };
}

// ─── Unit Records (Funcionamento de Unidade) ─────────────────

const UNIT_NAMES: Record<number, string> = {
  1: 'Canal VD',
  2: 'Logistica',
  3: 'VD Penedo',
  4: 'VD Palmeira dos Indios',
  5: 'Dados TI',
  6: 'Canal Loja',
  7: 'Loja Teotonio Vilela',
  8: 'Loja Palmeira dos Indios',
  9: 'Loja Penedo',
  10: 'Loja Sao Sebastiao',
  11: 'Loja Coruripe',
  12: 'Loja Digital',
  13: 'Financeiro/Administrativo',
  14: 'Gente e Cultura',
  15: 'Marketing',
};

export interface UnitEmployee {
  id: number;
  name: string;
  punch_1: string | null;
  punch_2: string | null;
  punch_3: string | null;
  punch_4: string | null;
  present: boolean;
  is_apprentice: boolean;
}

export interface UnitData {
  leader_id: number;
  unit_name: string;
  leader_name: string;
  employees: UnitEmployee[];
  present_count: number;
  total_count: number;
}

export async function getUnitRecords(date: string): Promise<UnitData[]> {
  const employees = await getAllEmployees();
  const leaders = await getAllLeaders();

  // Get all daily records for the date
  const snap = await getDb().collection(COLLECTIONS.DAILY_RECORDS)
    .where('date', '==', date).get();
  const records = docsToArray<DailyRecord>(snap);
  const recordMap = new Map(records.map(r => [r.employee_id, r]));

  // Group employees by leader
  const leaderMap = new Map(leaders.map(l => [l.id, l]));
  const grouped = new Map<number, EmployeeWithLeader[]>();

  for (const emp of employees) {
    const leaderId = emp.leader_id;
    if (!grouped.has(leaderId)) grouped.set(leaderId, []);
    grouped.get(leaderId)!.push(emp);
  }

  // Merge Marketing sub-leader (16) into leader (15), dedup by slack_id
  const marketing16 = grouped.get(16);
  if (marketing16) {
    const marketing15 = grouped.get(15) || [];
    const merged = [...marketing15, ...marketing16];
    const seen = new Set<string>();
    const deduped = merged.filter(e => {
      const key = e.slack_id || `id_${e.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    grouped.set(15, deduped);
    grouped.delete(16);
  }

  const units: UnitData[] = [];

  for (const [leaderId, emps] of grouped) {
    const unitName = UNIT_NAMES[leaderId];
    if (!unitName) continue; // skip leaders without unit mapping (e.g. Alta Lideranca id=1,8)

    const leader = leaderMap.get(leaderId);
    const unitEmployees: UnitEmployee[] = emps.map(emp => {
      const record = recordMap.get(emp.id);
      // Apprentices only punch entry + exit (2 punches), present = has punch_1
      const isApprentice = emp.is_apprentice === true;
      const present = isApprentice
        ? !!(record?.punch_1)
        : !!(record?.punch_1 && record?.punch_2);
      return {
        id: emp.id,
        name: emp.name,
        punch_1: record?.punch_1 ?? null,
        punch_2: record?.punch_2 ?? null,
        punch_3: record?.punch_3 ?? null,
        punch_4: record?.punch_4 ?? null,
        present,
        is_apprentice: isApprentice,
      };
    });

    // Sort: present first, then absent; alphabetical within each group
    unitEmployees.sort((a, b) => {
      if (a.present !== b.present) return a.present ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    units.push({
      leader_id: leaderId,
      unit_name: unitName,
      leader_name: leader?.name ?? '',
      employees: unitEmployees,
      present_count: unitEmployees.filter(e => e.present).length,
      total_count: unitEmployees.length,
    });
  }

  // Sort units alphabetically by name
  units.sort((a, b) => a.unit_name.localeCompare(b.unit_name));

  return units;
}

// ─── Helpers ──────────────────────────────────────────────────

async function getJustificationsMap(recordIds: number[]): Promise<Map<number, { reason: string; type: string }>> {
  const map = new Map<number, { reason: string; type: string }>();
  if (recordIds.length === 0) return map;

  for (const chunk of chunkArray(recordIds, 30)) {
    const snap = await getDb().collection(COLLECTIONS.JUSTIFICATIONS)
      .where('daily_record_id', 'in', chunk).get();
    for (const doc of snap.docs) {
      const data = doc.data();
      map.set(data.daily_record_id, { reason: data.reason, type: data.type });
    }
  }
  return map;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

// ─── Types ─────────────────────────────────────────────────────

export interface Leader {
  id: number;
  name: string;
  name_normalized: string;
  slack_id: string | null;
  sector: string | null;
  parent_leader_id: number | null;
  created_at: string;
}

export interface Employee {
  id: number;
  name: string;
  slack_id: string | null;
  leader_id: number;
  secondary_approver_id: number | null;
  solides_employee_id: string | null;
  is_apprentice: boolean;
  expected_daily_minutes: number;
  created_at: string;
}

export interface EmployeeWithLeader extends Employee {
  leader_name: string;
  leader_slack_id?: string | null;
  sector?: string | null;
}

export interface DailyRecord {
  id: number;
  employee_id: number;
  date: string;
  punch_1: string | null;
  punch_2: string | null;
  punch_3: string | null;
  punch_4: string | null;
  total_worked_minutes: number | null;
  difference_minutes: number | null;
  classification: string | null;
  alert_sent: number;
  manager_alert_sent: number;
  created_at: string;
  updated_at: string;
}

export interface DailyRecordFull extends DailyRecord {
  employee_name: string;
  employee_slack_id: string | null;
  leader_name: string;
  leader_slack_id: string | null;
  leader_id: number;
  justification_reason?: string | null;
  justification_type?: string | null;
}

export interface DailyRecordWithJustification extends DailyRecord {
  justification_reason?: string | null;
  justification_type?: string | null;
}

export interface JustificationWithDate {
  id: number;
  daily_record_id: number;
  employee_id: number;
  type: string;
  reason: string;
  custom_note: string | null;
  submitted_at: string;
  date: string;
}

export interface AuditLog {
  id?: number;
  action: string;
  entity_type: string;
  entity_id: number | null;
  details: string | null;
  created_at: string;
}

export interface User {
  id: number;
  slack_id: string;
  name: string;
  role: string;
  employee_id: number | null;
  leader_id: number | null;
  created_at: string;
}
