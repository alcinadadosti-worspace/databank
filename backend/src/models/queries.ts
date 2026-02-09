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

// ─── Cache System with TTL ────────────────────────────────────
interface CacheEntry<T> {
  data: T;
  expiry: number;
}

const cache = new Map<string, CacheEntry<any>>();

// Cache TTLs in milliseconds
const CACHE_TTL = {
  LEADERS: 10 * 60 * 1000,      // 10 minutes - rarely changes
  EMPLOYEES: 10 * 60 * 1000,    // 10 minutes - rarely changes
  RECORDS: 2 * 60 * 1000,       // 2 minutes - changes more often
  JUSTIFICATIONS: 2 * 60 * 1000, // 2 minutes
  UNITS: 1 * 60 * 1000,         // 1 minute - for presence data
};

function getCached<T>(key: string): T | null {
  const entry = cache.get(key);
  if (entry && Date.now() < entry.expiry) {
    return entry.data as T;
  }
  cache.delete(key);
  return null;
}

function setCache<T>(key: string, data: T, ttl: number): T {
  cache.set(key, { data, expiry: Date.now() + ttl });
  return data;
}

function invalidateCache(pattern?: string) {
  if (!pattern) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.includes(pattern)) {
      cache.delete(key);
    }
  }
}

// Legacy cache variables for compatibility
let leadersCache: Leader[] | null = null;
let employeesCache: EmployeeWithLeader[] | null = null;

function invalidateCaches() {
  leadersCache = null;
  employeesCache = null;
  invalidateCache(); // Clear all cache
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

export async function setNoPunchRequired(employeeId: number, noPunchRequired: boolean) {
  await getDb().collection(COLLECTIONS.EMPLOYEES).doc(String(employeeId)).update({
    no_punch_required: noPunchRequired,
  });
  invalidateCaches();
}

export async function deleteEmployee(employeeId: number) {
  await getDb().collection(COLLECTIONS.EMPLOYEES).doc(String(employeeId)).delete();
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

export async function getDailyRecordById(recordId: number): Promise<DailyRecord | undefined> {
  const snap = await getDb().collection(COLLECTIONS.DAILY_RECORDS)
    .where('id', '==', recordId).limit(1).get();
  if (snap.empty) return undefined;
  return snap.docs[0].data() as DailyRecord;
}

export async function updateDailyRecordPunches(
  recordId: number,
  punch1: string | null,
  punch2: string | null,
  punch3: string | null,
  punch4: string | null,
  totalWorkedMinutes: number | null,
  differenceMinutes: number | null,
  classification: string | null
) {
  const snap = await getDb().collection(COLLECTIONS.DAILY_RECORDS)
    .where('id', '==', recordId).limit(1).get();
  if (snap.empty) return false;

  await snap.docs[0].ref.update({
    punch_1: punch1,
    punch_2: punch2,
    punch_3: punch3,
    punch_4: punch4,
    total_worked_minutes: totalWorkedMinutes,
    difference_minutes: differenceMinutes,
    classification,
    updated_at: new Date().toISOString(),
  });
  return true;
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
  const justMap = new Map<number, { reason: string; type: string; status: string | null }>();
  for (const doc of justSnap.docs) {
    const j = doc.data();
    justMap.set(j.daily_record_id, { reason: j.reason, type: j.type, status: j.status || null });
  }

  return records.map(r => ({
    ...r,
    justification_reason: justMap.get(r.id)?.reason ?? null,
    justification_type: justMap.get(r.id)?.type ?? null,
    justification_status: justMap.get(r.id)?.status ?? null,
  }));
}

export async function getDailyRecordsByLeaderRange(
  leaderId: number, startDate: string, endDate: string
): Promise<DailyRecordFull[]> {
  const cacheKey = `leader_records_${leaderId}_${startDate}_${endDate}`;
  const cached = getCached<DailyRecordFull[]>(cacheKey);
  if (cached) return cached;

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

  const result = allRecords
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
        justification_status: justMap.get(r.id)?.status ?? null,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.employee_name.localeCompare(b.employee_name));

  return setCache(cacheKey, result, CACHE_TTL.RECORDS);
}

export async function getAllRecordsRange(startDate: string, endDate: string): Promise<DailyRecordFull[]> {
  const cacheKey = `records_${startDate}_${endDate}`;
  const cached = getCached<DailyRecordFull[]>(cacheKey);
  if (cached) return cached;

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

  const result = records.map(r => {
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
      justification_status: justMap.get(r.id)?.status ?? null,
    };
  }).sort((a, b) => b.date.localeCompare(a.date) || a.employee_name.localeCompare(b.employee_name));

  return setCache(cacheKey, result, CACHE_TTL.RECORDS);
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
  // Invalidate records cache for this date
  invalidateCache('records');
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
  // Invalidate justifications and records cache
  invalidateCache('justifications');
  invalidateCache('records');
}

export async function updateJustificationStatus(
  justificationId: number,
  status: 'approved' | 'rejected',
  reviewedBy: string,
  managerComment?: string
) {
  const snap = await getDb().collection(COLLECTIONS.JUSTIFICATIONS)
    .where('id', '==', justificationId).limit(1).get();
  if (!snap.empty) {
    await snap.docs[0].ref.update({
      status,
      reviewed_by: reviewedBy,
      reviewed_at: new Date().toISOString(),
      manager_comment: managerComment || null,
    });
    // Invalidate justifications and records cache
    invalidateCache('justifications');
    invalidateCache('records');
  }
}

interface JustificationData {
  id: number;
  daily_record_id: number;
  employee_id: number;
  type: 'late' | 'overtime';
  reason: string;
  custom_note: string | null;
  submitted_at: string;
  status?: 'pending' | 'approved' | 'rejected';
  reviewed_by?: string;
  reviewed_at?: string;
  manager_comment?: string;
}

export async function getJustificationById(justificationId: number): Promise<(JustificationData & { date: string }) | undefined> {
  const snap = await getDb().collection(COLLECTIONS.JUSTIFICATIONS)
    .where('id', '==', justificationId).limit(1).get();
  if (snap.empty) return undefined;
  const justification = snap.docs[0].data() as JustificationData;

  // Get date from daily record
  const recordSnap = await getDb().collection(COLLECTIONS.DAILY_RECORDS)
    .where('id', '==', justification.daily_record_id).limit(1).get();
  const date = recordSnap.empty ? '' : recordSnap.docs[0].data().date;

  return {
    ...justification,
    date,
  };
}

export async function deleteJustificationByRecordId(dailyRecordId: number) {
  const snap = await getDb().collection(COLLECTIONS.JUSTIFICATIONS)
    .where('daily_record_id', '==', dailyRecordId).get();
  if (snap.empty) return false;
  for (const doc of snap.docs) {
    await doc.ref.delete();
  }
  return true;
}

export async function deleteJustification(justificationId: number) {
  const snap = await getDb().collection(COLLECTIONS.JUSTIFICATIONS)
    .where('id', '==', justificationId).limit(1).get();
  if (snap.empty) return false;
  await snap.docs[0].ref.delete();
  return true;
}

export async function getPendingJustificationsByLeader(leaderId: number): Promise<JustificationFull[]> {
  const employees = await getEmployeesByLeaderId(leaderId);
  const empIds = employees.map(e => e.id);
  if (empIds.length === 0) return [];

  const empIdSet = new Set(empIds);
  const empMap = new Map(employees.map(e => [e.id, e]));

  // Get all justifications, filter by employee IDs in memory
  const snap = await getDb().collection(COLLECTIONS.JUSTIFICATIONS).get();
  const allJustifications = docsToArray<any>(snap).filter(j => empIdSet.has(j.employee_id));

  // Filter for pending (no status or status = 'pending')
  const pending = allJustifications.filter(j => !j.status || j.status === 'pending');

  // Get daily_record dates
  const recordIds = [...new Set(pending.map(j => j.daily_record_id))];
  const dateMap = new Map<number, string>();

  for (const chunk of chunkArray(recordIds, 30)) {
    const rSnap = await getDb().collection(COLLECTIONS.DAILY_RECORDS)
      .where('id', 'in', chunk).get();
    for (const doc of rSnap.docs) {
      const data = doc.data();
      dateMap.set(data.id, data.date);
    }
  }

  return pending.map(j => {
    const emp = empMap.get(j.employee_id);
    return {
      ...j,
      date: dateMap.get(j.daily_record_id) ?? '',
      employee_name: emp?.name ?? '',
      status: j.status || 'pending',
    };
  }).sort((a: any, b: any) => b.date.localeCompare(a.date));
}

export interface JustificationFull {
  id: number;
  daily_record_id: number;
  employee_id: number;
  type: string;
  reason: string;
  custom_note: string | null;
  submitted_at: string;
  date: string;
  employee_name: string;
  status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: string;
  reviewed_at?: string;
  manager_comment?: string | null;
  leader_id?: number;
  leader_name?: string;
  unit_name?: string;
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

// Unit name mapping for admin panel
const UNIT_NAMES_MAP: Record<number, string> = {
  2: 'Logistica',
  3: 'VD Penedo',
  4: 'VD Palmeira dos Indios',
  5: 'Dados TI',
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

export async function getReviewedJustifications(): Promise<JustificationFull[]> {
  const employees = await getAllEmployees();
  const empMap = new Map(employees.map(e => [e.id, e]));

  // Get all justifications that have been reviewed (approved or rejected)
  const snap = await getDb().collection(COLLECTIONS.JUSTIFICATIONS).get();
  const allJustifications = docsToArray<any>(snap);
  const reviewed = allJustifications.filter(j => j.status === 'approved' || j.status === 'rejected');

  // Get daily_record dates
  const recordIds = [...new Set(reviewed.map(j => j.daily_record_id))];
  const dateMap = new Map<number, string>();

  for (const chunk of chunkArray(recordIds, 30)) {
    const rSnap = await getDb().collection(COLLECTIONS.DAILY_RECORDS)
      .where('id', 'in', chunk).get();
    for (const doc of rSnap.docs) {
      const data = doc.data();
      dateMap.set(data.id, data.date);
    }
  }

  return reviewed.map(j => {
    const emp = empMap.get(j.employee_id);
    return {
      ...j,
      date: dateMap.get(j.daily_record_id) ?? '',
      employee_name: emp?.name ?? '',
      leader_id: emp?.leader_id ?? 0,
      leader_name: emp?.leader_name ?? '',
      unit_name: UNIT_NAMES_MAP[emp?.leader_id ?? 0] ?? 'Outro',
    };
  }).sort((a: any, b: any) => b.reviewed_at?.localeCompare(a.reviewed_at ?? '') ?? 0);
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
  // 1: 'Canal VD' - removed, leaders moved to their respective VD units
  2: 'Logistica Penedo',
  3: 'VD Penedo',
  4: 'VD Palmeira dos Indios',
  5: 'Dados TI',
  // 6: 'Canal Loja' - removed, leaders moved to their respective stores
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

// Employees that belong to Logistica Palmeira dos Indios (split from leader_id=2)
const LOGISTICA_PALMEIRA_EMPLOYEES = [
  'Hugo Castro Lopes',
  'João Victor Santos da Silva',
  'Pedro Lucas Rocha da Fonseca',
].map(n => n.toLowerCase());

// Store leaders from Canal Loja (leader_id=6) that should appear in their own stores
// Maps employee name (lowercase) → target leader_id (their store)
const STORE_LEADER_MAPPING: Record<string, number> = {
  'maria taciane pereira barbosa': 11,      // → Loja Coruripe
  'ana clara de matos chagas': 9,           // → Loja Penedo
  'kemilly rafaelly souza silva': 10,       // → Loja Sao Sebastiao
  'erick café santos júnior': 7,            // → Loja Teotonio Vilela
  // Leidiane Souza excluded - should not appear in Loja Palmeira dos Indios
};

// VD leaders from Canal VD (leader_id=1) that should appear in their own VD units
const VD_LEADER_MAPPING: Record<string, number> = {
  'joao antonio tavares santos': 3,              // → VD Penedo
  'joão antonio tavares santos': 3,              // → VD Penedo (with accent)
  'jonathan henrique da conceição silva': 4,     // → VD Palmeira dos Indios
  'jonathan henrique da conceicao silva': 4,     // → VD Palmeira dos Indios (without accent)
};

// Custom sort order: Loja first, then VD, then others alphabetically
const UNIT_SORT_ORDER: Record<string, number> = {
  'Loja Coruripe': 1,
  'Loja Digital': 2,
  'Loja Palmeira dos Indios': 3,
  'Loja Penedo': 4,
  'Loja Sao Sebastiao': 5,
  'Loja Teotonio Vilela': 6,
  'VD Palmeira dos Indios': 7,
  'VD Penedo': 8,
  // All other units will get a high number and sort alphabetically
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
  no_punch_required: boolean;
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

  // Separate employees who don't punch from regular employees
  const noPunchEmployees: EmployeeWithLeader[] = [];
  const regularEmployees: EmployeeWithLeader[] = [];

  for (const emp of employees) {
    if (emp.no_punch_required === true) {
      noPunchEmployees.push(emp);
    } else {
      regularEmployees.push(emp);
    }
  }

  // Group regular employees by leader
  const leaderMap = new Map(leaders.map(l => [l.id, l]));
  const grouped = new Map<number, EmployeeWithLeader[]>();

  for (const emp of regularEmployees) {
    const leaderId = emp.leader_id;
    if (!grouped.has(leaderId)) grouped.set(leaderId, []);
    grouped.get(leaderId)!.push(emp);
  }

  // Merge Marketing sub-leader (16) into leader (15), dedup by slack_id
  // Prefer the record that has punch data in recordMap
  const marketing16 = grouped.get(16);
  if (marketing16) {
    const marketing15 = grouped.get(15) || [];
    const merged = [...marketing15, ...marketing16];
    const best = new Map<string, EmployeeWithLeader>();
    for (const e of merged) {
      const key = e.slack_id || `id_${e.id}`;
      const existing = best.get(key);
      if (!existing) {
        best.set(key, e);
      } else {
        // Prefer the one that has a daily record
        const existingHasRecord = recordMap.has(existing.id);
        const newHasRecord = recordMap.has(e.id);
        if (!existingHasRecord && newHasRecord) {
          best.set(key, e);
        }
      }
    }
    grouped.set(15, [...best.values()]);
    grouped.delete(16);
  }

  // Move store leaders from Canal Loja (leader_id=6) to their respective stores
  const canalLoja = grouped.get(6) || [];
  for (const emp of canalLoja) {
    const targetLeaderId = STORE_LEADER_MAPPING[emp.name.toLowerCase()];
    if (targetLeaderId) {
      // Add this employee to their store's unit
      if (!grouped.has(targetLeaderId)) grouped.set(targetLeaderId, []);
      grouped.get(targetLeaderId)!.push(emp);
    }
    // If not in mapping (e.g., Leidiane), they're simply excluded
  }
  grouped.delete(6); // Remove Canal Loja entirely

  // Move VD leaders from Canal VD (leader_id=1) to their respective VD units
  const canalVD = grouped.get(1) || [];
  for (const emp of canalVD) {
    const targetLeaderId = VD_LEADER_MAPPING[emp.name.toLowerCase()];
    if (targetLeaderId) {
      // Add this employee to their VD unit
      if (!grouped.has(targetLeaderId)) grouped.set(targetLeaderId, []);
      grouped.get(targetLeaderId)!.push(emp);
    }
    // If not in mapping (e.g., Romulo), they're simply excluded
  }
  grouped.delete(1); // Remove Canal VD entirely

  // Split Logistica (leader_id=2) into Penedo and Palmeira dos Indios
  const logisticaAll = grouped.get(2) || [];
  const logisticaPalmeira: EmployeeWithLeader[] = [];
  const logisticaPenedo: EmployeeWithLeader[] = [];

  for (const emp of logisticaAll) {
    if (LOGISTICA_PALMEIRA_EMPLOYEES.includes(emp.name.toLowerCase())) {
      logisticaPalmeira.push(emp);
    } else {
      logisticaPenedo.push(emp);
    }
  }

  // Update grouped map with split Logistica
  if (logisticaPenedo.length > 0) {
    grouped.set(2, logisticaPenedo);
  } else {
    grouped.delete(2);
  }

  const units: UnitData[] = [];

  // Helper to create UnitEmployee from EmployeeWithLeader
  function toUnitEmployee(emp: EmployeeWithLeader): UnitEmployee {
    const record = recordMap.get(emp.id);
    const noPunchRequired = emp.no_punch_required === true;
    const isApprentice = emp.is_apprentice === true;
    const present = noPunchRequired || !!(record?.punch_1);
    return {
      id: emp.id,
      name: emp.name,
      punch_1: record?.punch_1 ?? null,
      punch_2: record?.punch_2 ?? null,
      punch_3: record?.punch_3 ?? null,
      punch_4: record?.punch_4 ?? null,
      present,
      is_apprentice: isApprentice,
      no_punch_required: noPunchRequired,
    };
  }

  // Process regular units
  for (const [leaderId, emps] of grouped) {
    const unitName = UNIT_NAMES[leaderId];
    if (!unitName) continue; // skip leaders without unit mapping

    const leader = leaderMap.get(leaderId);
    const unitEmployees = emps.map(toUnitEmployee);

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

  // Add Logistica Palmeira dos Indios as separate unit (same leader as Penedo)
  if (logisticaPalmeira.length > 0) {
    const leader = leaderMap.get(2);
    const unitEmployees = logisticaPalmeira.map(toUnitEmployee);
    unitEmployees.sort((a, b) => {
      if (a.present !== b.present) return a.present ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    units.push({
      leader_id: 2,
      unit_name: 'Logistica Palmeira dos Indios',
      leader_name: leader?.name ?? '',
      employees: unitEmployees,
      present_count: unitEmployees.filter(e => e.present).length,
      total_count: unitEmployees.length,
    });
  }

  // Add "Sem Ponto" card for employees who don't use punch clock
  if (noPunchEmployees.length > 0) {
    const unitEmployees = noPunchEmployees.map(toUnitEmployee);
    unitEmployees.sort((a, b) => a.name.localeCompare(b.name));

    units.push({
      leader_id: 0, // special ID for this virtual unit
      unit_name: 'Sem Ponto',
      leader_name: '',
      employees: unitEmployees,
      present_count: unitEmployees.length, // always considered present
      total_count: unitEmployees.length,
    });
  }

  // Custom sort: Loja units first, then others alphabetically
  units.sort((a, b) => {
    const orderA = UNIT_SORT_ORDER[a.unit_name] ?? 100;
    const orderB = UNIT_SORT_ORDER[b.unit_name] ?? 100;
    if (orderA !== orderB) return orderA - orderB;
    return a.unit_name.localeCompare(b.unit_name);
  });

  return units;
}

// ─── Helpers ──────────────────────────────────────────────────

async function getJustificationsMap(recordIds: number[]): Promise<Map<number, { reason: string; type: string; status: string | null }>> {
  const map = new Map<number, { reason: string; type: string; status: string | null }>();
  if (recordIds.length === 0) return map;

  // Create a cache key based on sorted record IDs
  const sortedIds = [...recordIds].sort((a, b) => a - b);
  const cacheKey = `justifications_${sortedIds.slice(0, 10).join('_')}_${sortedIds.length}`;
  const cached = getCached<[number, { reason: string; type: string; status: string | null }][]>(cacheKey);
  if (cached) {
    for (const [id, data] of cached) {
      map.set(id, data);
    }
    return map;
  }

  for (const chunk of chunkArray(recordIds, 30)) {
    const snap = await getDb().collection(COLLECTIONS.JUSTIFICATIONS)
      .where('daily_record_id', 'in', chunk).get();
    for (const doc of snap.docs) {
      const data = doc.data();
      map.set(data.daily_record_id, { reason: data.reason, type: data.type, status: data.status || null });
    }
  }

  // Cache the result
  setCache(cacheKey, Array.from(map.entries()), CACHE_TTL.JUSTIFICATIONS);
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
  no_punch_required: boolean;
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
