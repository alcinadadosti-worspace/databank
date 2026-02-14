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

export async function insertEmployeeFull(
  name: string,
  slackId: string | null,
  leaderId: number,
  solidesId: string | null
) {
  const id = await getNextId(COLLECTIONS.EMPLOYEES);
  const data = {
    id,
    name,
    slack_id: slackId,
    leader_id: leaderId,
    secondary_approver_id: null,
    solides_employee_id: solidesId,
    is_apprentice: false,
    expected_daily_minutes: 528,
    no_punch_required: false,
    works_saturday: true,
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

export async function setWorksSaturday(employeeId: number, worksSaturday: boolean) {
  await getDb().collection(COLLECTIONS.EMPLOYEES).doc(String(employeeId)).update({
    works_saturday: worksSaturday,
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

export async function updateEmployeeLeader(employeeId: number, leaderId: number) {
  await getDb().collection(COLLECTIONS.EMPLOYEES).doc(String(employeeId)).update({
    leader_id: leaderId,
  });
  invalidateCaches();
}

export async function updateEmployeeSlackId(employeeId: number, slackId: string) {
  await getDb().collection(COLLECTIONS.EMPLOYEES).doc(String(employeeId)).update({
    slack_id: slackId,
  });
  invalidateCaches();
}

export async function updateEmployeeFull(
  employeeId: number,
  data: { name?: string; leader_id?: number; slack_id?: string; solides_employee_id?: string }
) {
  const updateData: Record<string, any> = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.leader_id !== undefined) updateData.leader_id = data.leader_id;
  if (data.slack_id !== undefined) updateData.slack_id = data.slack_id;
  if (data.solides_employee_id !== undefined) updateData.solides_employee_id = data.solides_employee_id;

  if (Object.keys(updateData).length > 0) {
    await getDb().collection(COLLECTIONS.EMPLOYEES).doc(String(employeeId)).update(updateData);
    invalidateCaches();
  }
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

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export async function getDailyRecordsByLeaderRange(
  leaderId: number, startDate: string, endDate: string,
  options?: { limit?: number; offset?: number }
): Promise<DailyRecordFull[] | PaginatedResult<DailyRecordFull>> {
  const { limit, offset } = options || {};
  const isPaginated = limit !== undefined && offset !== undefined;

  const cacheKey = `leader_records_${leaderId}_${startDate}_${endDate}`;
  const cached = getCached<DailyRecordFull[]>(cacheKey);

  // If we have cached data and pagination is requested, slice it
  if (cached) {
    if (isPaginated) {
      const sliced = cached.slice(offset, offset + limit);
      return {
        data: sliced,
        total: cached.length,
        limit,
        offset,
        hasMore: offset + limit < cached.length,
      };
    }
    return cached;
  }

  const employees = await getEmployeesByLeaderId(leaderId);
  const empIds = employees.map(e => e.id);
  if (empIds.length === 0) {
    if (isPaginated) {
      return { data: [], total: 0, limit, offset, hasMore: false };
    }
    return [];
  }

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

  // Cache the full result
  setCache(cacheKey, result, CACHE_TTL.RECORDS);

  // Return paginated or full result
  if (isPaginated) {
    const sliced = result.slice(offset, offset + limit);
    return {
      data: sliced,
      total: result.length,
      limit,
      offset,
      hasMore: offset + limit < result.length,
    };
  }
  return result;
}

export async function getAllRecordsRange(
  startDate: string, endDate: string,
  options?: { limit?: number; offset?: number }
): Promise<DailyRecordFull[] | PaginatedResult<DailyRecordFull>> {
  const { limit, offset } = options || {};
  const isPaginated = limit !== undefined && offset !== undefined;

  const cacheKey = `records_${startDate}_${endDate}`;
  const cached = getCached<DailyRecordFull[]>(cacheKey);

  if (cached) {
    if (isPaginated) {
      const sliced = cached.slice(offset, offset + limit);
      return {
        data: sliced,
        total: cached.length,
        limit,
        offset,
        hasMore: offset + limit < cached.length,
      };
    }
    return cached;
  }

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

  // Cache the full result
  setCache(cacheKey, result, CACHE_TTL.RECORDS);

  if (isPaginated) {
    const sliced = result.slice(offset, offset + limit);
    return {
      data: sliced,
      total: result.length,
      limit,
      offset,
      hasMore: offset + limit < result.length,
    };
  }
  return result;
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
  // Invalidate cache
  invalidateCache('justifications');
  invalidateCache('records');
  return true;
}

export async function deleteMultipleJustifications(justificationIds: number[]) {
  if (justificationIds.length === 0) return 0;

  let deleted = 0;
  // OPTIMIZATION: Use batch API for deletes (up to 500 operations per batch)
  for (const chunk of chunkArray(justificationIds, 30)) {
    const snap = await getDb().collection(COLLECTIONS.JUSTIFICATIONS)
      .where('id', 'in', chunk).get();

    if (snap.docs.length > 0) {
      const batch = getDb().batch();
      for (const doc of snap.docs) {
        batch.delete(doc.ref);
        deleted++;
      }
      await batch.commit();
    }
  }
  // Invalidate cache
  invalidateCache('justifications');
  invalidateCache('records');
  return deleted;
}

export async function getPendingJustificationsByLeader(
  leaderId: number,
  options?: { limit?: number; offset?: number }
): Promise<JustificationFull[] | PaginatedResult<JustificationFull>> {
  const { limit, offset } = options || {};
  const isPaginated = limit !== undefined && offset !== undefined;

  const employees = await getEmployeesByLeaderId(leaderId);
  const empIds = employees.map(e => e.id);
  if (empIds.length === 0) {
    if (isPaginated) {
      return { data: [], total: 0, limit, offset, hasMore: false };
    }
    return [];
  }

  const empMap = new Map(employees.map(e => [e.id, e]));

  // OPTIMIZATION: Query justifications by employee IDs in batches instead of full scan
  const allJustifications: any[] = [];
  for (const chunk of chunkArray(empIds, 10)) {
    const snap = await getDb().collection(COLLECTIONS.JUSTIFICATIONS)
      .where('employee_id', 'in', chunk)
      .get();
    allJustifications.push(...docsToArray<any>(snap));
  }

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

  const result = pending.map(j => {
    const emp = empMap.get(j.employee_id);
    return {
      ...j,
      date: dateMap.get(j.daily_record_id) ?? '',
      employee_name: emp?.name ?? '',
      status: j.status || 'pending',
    };
  }).sort((a: any, b: any) => b.date.localeCompare(a.date));

  if (isPaginated) {
    const sliced = result.slice(offset, offset + limit);
    return {
      data: sliced,
      total: result.length,
      limit,
      offset,
      hasMore: offset + limit < result.length,
    };
  }
  return result;
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
  7: 'Supervisoras Penedo',           // Erick Café - VD team
  9: 'Salão de vendas Penedo',        // Ana Clara - VD team
  10: 'Loja Palmeira dos Indios',     // Kemilly
  11: 'Loja Coruripe',                // Maria Taciane
  12: 'Loja Digital',
  13: 'Financeiro/Administrativo',
  14: 'Gente e Cultura',
  15: 'Marketing',
};

export async function getReviewedJustifications(
  options?: { limit?: number; offset?: number }
): Promise<JustificationFull[] | PaginatedResult<JustificationFull>> {
  const { limit, offset } = options || {};
  const isPaginated = limit !== undefined && offset !== undefined;

  const employees = await getAllEmployees();
  const empMap = new Map(employees.map(e => [e.id, e]));

  // OPTIMIZATION: Query only reviewed justifications instead of full scan
  // Firestore 'in' query for status field
  const [approvedSnap, rejectedSnap] = await Promise.all([
    getDb().collection(COLLECTIONS.JUSTIFICATIONS).where('status', '==', 'approved').get(),
    getDb().collection(COLLECTIONS.JUSTIFICATIONS).where('status', '==', 'rejected').get(),
  ]);

  const reviewed = [
    ...docsToArray<any>(approvedSnap),
    ...docsToArray<any>(rejectedSnap),
  ];

  // Get daily_record data (date + punches)
  const recordIds = [...new Set(reviewed.map(j => j.daily_record_id))];
  const recordMap = new Map<number, {
    date: string;
    punch_1: string | null;
    punch_2: string | null;
    punch_3: string | null;
    punch_4: string | null;
    difference_minutes: number | null;
    classification: string | null;
  }>();

  for (const chunk of chunkArray(recordIds, 30)) {
    const rSnap = await getDb().collection(COLLECTIONS.DAILY_RECORDS)
      .where('id', 'in', chunk).get();
    for (const doc of rSnap.docs) {
      const data = doc.data();
      recordMap.set(data.id, {
        date: data.date,
        punch_1: data.punch_1 || null,
        punch_2: data.punch_2 || null,
        punch_3: data.punch_3 || null,
        punch_4: data.punch_4 || null,
        difference_minutes: data.difference_minutes ?? null,
        classification: data.classification || null,
      });
    }
  }

  const result = reviewed.map(j => {
    const emp = empMap.get(j.employee_id);
    const record = recordMap.get(j.daily_record_id);
    return {
      ...j,
      date: record?.date ?? '',
      punch_1: record?.punch_1 ?? null,
      punch_2: record?.punch_2 ?? null,
      punch_3: record?.punch_3 ?? null,
      punch_4: record?.punch_4 ?? null,
      difference_minutes: record?.difference_minutes ?? null,
      classification: record?.classification ?? null,
      employee_name: emp?.name ?? '',
      leader_id: emp?.leader_id ?? 0,
      leader_name: emp?.leader_name ?? '',
      unit_name: UNIT_NAMES_MAP[emp?.leader_id ?? 0] ?? 'Outro',
    };
  }).sort((a: any, b: any) => b.reviewed_at?.localeCompare(a.reviewed_at ?? '') ?? 0);

  if (isPaginated) {
    const sliced = result.slice(offset, offset + limit);
    return {
      data: sliced,
      total: result.length,
      limit,
      offset,
      hasMore: offset + limit < result.length,
    };
  }
  return result;
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
  3: 'Supervisoras de base',          // Joao Antonio - VD team
  4: 'VD Palmeira dos Indios',
  5: 'Dados TI',
  // 6: 'Canal Loja' - removed, leaders moved to their respective stores
  7: 'Supervisoras Penedo',           // Erick Café - VD team
  9: 'Salão de vendas Penedo',        // Ana Clara - VD team
  // 10, 11: Kemilly and Maria Taciane have multiple virtual units (handled separately)
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

// Maria Taciane's employees that came from Loja Penedo (virtual unit)
const LOJA_PENEDO_EMPLOYEES = [
  'cristielle pereira lima da silva',
  'deise gislaine silva vitor',
  'samyra anchieta bispo',
];

// Maria Taciane's employees that came from Loja Teotonio Vilela (virtual unit)
const LOJA_TEOTONIO_VILELA_EMPLOYEES = [
  'camille kauane da silva nunes',
  'eliene da silva santos',
  'maria tatiane basto cardoso',
];

// Maria Taciane's original employees from Loja Coruripe (including herself as manager)
const LOJA_CORURIPE_EMPLOYEES = [
  'maria taciane pereira barbosa',
  'ana paula amaral santos ismerim',
  'bruna rayane oliveira dos santos',
  'thamirys silvestrini morales',
];

// Kemilly's employees for Loja Palmeira dos Indios (transferred from Leidiane)
const LOJA_PALMEIRA_KEMILLY_EMPLOYEES = [
  'yasmin abilia ferro da silva',
  'robéria gilo da silva',
  'valesca meirelle bezerra vitória',
];

// Kemilly's original employees for Loja Sao Sebastiao (including herself as manager)
const LOJA_SAO_SEBASTIAO_EMPLOYEES = [
  'kemilly rafaelly souza silva',
  'gabrielle vitoria dos santos',
  'maryanna francielly trajano da silva',
];

// Store leaders from Canal Loja (leader_id=6) that should appear in their own units
// Maps employee name (lowercase) → target leader_id (their unit)
const STORE_LEADER_MAPPING: Record<string, number> = {
  'maria taciane pereira barbosa': 11,      // → Loja Coruripe
  'kemilly rafaelly souza silva': 10,       // → Loja Sao Sebastiao
  'ana clara de matos chagas': 9,           // → Salão de vendas Penedo
  'erick café santos júnior': 7,            // → Supervisoras Penedo
  'erick cafe santos junior': 7,            // → Supervisoras Penedo (without accent)
  // Leidiane Souza excluded - Alta Liderança
  // Mariane Santos Sousa excluded - not a unit leader
};

// VD leaders from Canal VD (leader_id=1) that should appear in their own VD units
const VD_LEADER_MAPPING: Record<string, number> = {
  'joao antonio tavares santos': 3,              // → VD Penedo
  'joão antonio tavares santos': 3,              // → VD Penedo (with accent)
  'jonathan henrique da conceição silva': 4,     // → VD Palmeira dos Indios
  'jonathan henrique da conceicao silva': 4,     // → VD Palmeira dos Indios (without accent)
  'ana clara de matos chagas': 9,                // → Salão de vendas Penedo
  'erick café santos júnior': 7,                 // → Supervisoras Penedo
  'erick cafe santos junior': 7,                 // → Supervisoras Penedo (without accent)
};

// Custom sort order: Loja first, then VD/Salão, then others alphabetically
const UNIT_SORT_ORDER: Record<string, number> = {
  'Loja Coruripe': 1,
  'Loja Digital': 2,
  'Loja Palmeira dos Indios': 3,
  'Loja Penedo': 4,
  'Loja Sao Sebastiao': 5,
  'Loja Teotonio Vilela': 6,
  'Salão de vendas Penedo': 7,
  'Supervisoras de base': 8,
  'Supervisoras Penedo': 9,
  'VD Palmeira dos Indios': 10,
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

  // Split Kemilly's employees into virtual units (Loja Palmeira dos Indios and Loja Sao Sebastiao)
  const kemillyLeader = leaderMap.get(10); // Kemilly ID
  const kemillyEmps = grouped.get(10) || [];

  // Loja Palmeira dos Indios (Kemilly's employees - transferred from Leidiane)
  const lojaPalmeiraKemillyEmps = kemillyEmps.filter(emp =>
    LOJA_PALMEIRA_KEMILLY_EMPLOYEES.includes(emp.name.toLowerCase())
  );
  if (lojaPalmeiraKemillyEmps.length > 0) {
    const unitEmployees = lojaPalmeiraKemillyEmps.map(toUnitEmployee);
    unitEmployees.sort((a, b) => {
      if (a.present !== b.present) return a.present ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    units.push({
      leader_id: 10,
      unit_name: 'Loja Palmeira dos Indios',
      leader_name: kemillyLeader?.name ?? 'Kemilly Rafaelly Souza Silva',
      employees: unitEmployees,
      present_count: unitEmployees.filter(e => e.present).length,
      total_count: unitEmployees.length,
    });
  }

  // Loja Sao Sebastiao (Kemilly's original employees)
  const lojaSaoSebEmps = kemillyEmps.filter(emp =>
    LOJA_SAO_SEBASTIAO_EMPLOYEES.includes(emp.name.toLowerCase())
  );
  if (lojaSaoSebEmps.length > 0) {
    const unitEmployees = lojaSaoSebEmps.map(toUnitEmployee);
    unitEmployees.sort((a, b) => {
      if (a.present !== b.present) return a.present ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    units.push({
      leader_id: 10,
      unit_name: 'Loja Sao Sebastiao',
      leader_name: kemillyLeader?.name ?? 'Kemilly Rafaelly Souza Silva',
      employees: unitEmployees,
      present_count: unitEmployees.filter(e => e.present).length,
      total_count: unitEmployees.length,
    });
  }

  // Split Maria Taciane's employees into virtual units (Loja Coruripe, Loja Penedo, Loja Teotonio Vilela)
  const mariaTacianeLeader = leaderMap.get(11); // Maria Taciane ID
  const mariaTacianeEmps = grouped.get(11) || [];

  // Loja Coruripe (Maria Taciane's original employees)
  const lojaCoruriEmps = mariaTacianeEmps.filter(emp =>
    LOJA_CORURIPE_EMPLOYEES.includes(emp.name.toLowerCase())
  );
  if (lojaCoruriEmps.length > 0) {
    const unitEmployees = lojaCoruriEmps.map(toUnitEmployee);
    unitEmployees.sort((a, b) => {
      if (a.present !== b.present) return a.present ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    units.push({
      leader_id: 11,
      unit_name: 'Loja Coruripe',
      leader_name: mariaTacianeLeader?.name ?? 'Maria Taciane Pereira Barbosa',
      employees: unitEmployees,
      present_count: unitEmployees.filter(e => e.present).length,
      total_count: unitEmployees.length,
    });
  }

  // Loja Penedo (employees that came from Ana Clara's old team)
  const lojaPenedoEmps = mariaTacianeEmps.filter(emp =>
    LOJA_PENEDO_EMPLOYEES.includes(emp.name.toLowerCase())
  );
  if (lojaPenedoEmps.length > 0) {
    const unitEmployees = lojaPenedoEmps.map(toUnitEmployee);
    unitEmployees.sort((a, b) => {
      if (a.present !== b.present) return a.present ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    units.push({
      leader_id: 11,
      unit_name: 'Loja Penedo',
      leader_name: mariaTacianeLeader?.name ?? 'Maria Taciane Pereira Barbosa',
      employees: unitEmployees,
      present_count: unitEmployees.filter(e => e.present).length,
      total_count: unitEmployees.length,
    });
  }

  // Loja Teotonio Vilela (employees that came from Erick's old team)
  const lojaTeotoniEmps = mariaTacianeEmps.filter(emp =>
    LOJA_TEOTONIO_VILELA_EMPLOYEES.includes(emp.name.toLowerCase())
  );
  if (lojaTeotoniEmps.length > 0) {
    const unitEmployees = lojaTeotoniEmps.map(toUnitEmployee);
    unitEmployees.sort((a, b) => {
      if (a.present !== b.present) return a.present ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    units.push({
      leader_id: 11,
      unit_name: 'Loja Teotonio Vilela',
      leader_name: mariaTacianeLeader?.name ?? 'Maria Taciane Pereira Barbosa',
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
  works_saturday: boolean;
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

// ─── Holidays ─────────────────────────────────────────────────

export interface Holiday {
  id: number;
  date: string; // YYYY-MM-DD
  name: string;
  type: 'national' | 'state' | 'municipal' | 'company'; // tipo do feriado
  recurring: boolean; // se repete todo ano (ignora o ano na comparação)
  created_at: string;
}

let holidaysCache: Holiday[] | null = null;

export async function getAllHolidays(): Promise<Holiday[]> {
  if (holidaysCache) return holidaysCache;
  const snap = await getDb().collection(COLLECTIONS.HOLIDAYS).orderBy('date', 'desc').get();
  holidaysCache = docsToArray<Holiday>(snap);
  return holidaysCache;
}

export async function getHolidayById(id: number): Promise<Holiday | undefined> {
  const holidays = await getAllHolidays();
  return holidays.find(h => h.id === id);
}

export async function insertHoliday(
  date: string,
  name: string,
  type: Holiday['type'],
  recurring: boolean
): Promise<{ id: number }> {
  const id = await getNextId(COLLECTIONS.HOLIDAYS);
  const data: Holiday = {
    id,
    date,
    name,
    type,
    recurring,
    created_at: new Date().toISOString(),
  };
  await getDb().collection(COLLECTIONS.HOLIDAYS).doc(String(id)).set(data);
  holidaysCache = null; // Invalidate cache
  return { id };
}

export async function updateHoliday(
  id: number,
  date: string,
  name: string,
  type: Holiday['type'],
  recurring: boolean
): Promise<boolean> {
  const snap = await getDb().collection(COLLECTIONS.HOLIDAYS)
    .where('id', '==', id).limit(1).get();
  if (snap.empty) return false;

  await snap.docs[0].ref.update({
    date,
    name,
    type,
    recurring,
  });
  holidaysCache = null; // Invalidate cache
  return true;
}

export async function deleteHoliday(id: number): Promise<boolean> {
  const snap = await getDb().collection(COLLECTIONS.HOLIDAYS)
    .where('id', '==', id).limit(1).get();
  if (snap.empty) return false;

  await snap.docs[0].ref.delete();
  holidaysCache = null; // Invalidate cache
  return true;
}

/**
 * Check if a given date is a holiday.
 * For recurring holidays, only compares month and day.
 */
export async function isHoliday(date: string): Promise<boolean> {
  const holidays = await getAllHolidays();
  const [year, month, day] = date.split('-');

  return holidays.some(h => {
    if (h.recurring) {
      // For recurring holidays, only compare month and day
      const [, hMonth, hDay] = h.date.split('-');
      return hMonth === month && hDay === day;
    }
    return h.date === date;
  });
}

/**
 * Get holiday info for a specific date (if exists).
 */
export async function getHolidayForDate(date: string): Promise<Holiday | undefined> {
  const holidays = await getAllHolidays();
  const [year, month, day] = date.split('-');

  return holidays.find(h => {
    if (h.recurring) {
      const [, hMonth, hDay] = h.date.split('-');
      return hMonth === month && hDay === day;
    }
    return h.date === date;
  });
}

/**
 * Get all holidays for a given year (including recurring ones).
 */
export async function getHolidaysForYear(year: number): Promise<Holiday[]> {
  const holidays = await getAllHolidays();

  return holidays.filter(h => {
    if (h.recurring) return true; // Recurring holidays apply to all years
    return h.date.startsWith(String(year));
  }).map(h => {
    if (h.recurring) {
      // Adjust recurring holiday date to the requested year
      const [, month, day] = h.date.split('-');
      return { ...h, date: `${year}-${month}-${day}` };
    }
    return h;
  }).sort((a, b) => a.date.localeCompare(b.date));
}

// Import static holiday check
import { isHoliday as isStaticHoliday, isWorkingDay as isStaticWorkingDay } from '../config/constants';

/**
 * Check if a date is a holiday (combines static + database holidays)
 */
export async function isHolidayAsync(date: string): Promise<boolean> {
  // First check static holidays (faster)
  if (isStaticHoliday(date)) {
    return true;
  }
  // Then check database holidays
  return await isHoliday(date);
}

/**
 * Check if a date is a working day (not Sunday, not holiday)
 * Uses both static and database holidays
 */
export async function isWorkingDayAsync(dateStr: string): Promise<boolean> {
  const dateObj = new Date(dateStr + 'T12:00:00Z');
  const dayOfWeek = dateObj.getUTCDay(); // 0 = Sunday, 6 = Saturday

  // Sunday - not a working day
  if (dayOfWeek === 0) {
    return false;
  }

  // Check if it's a holiday (static + database)
  if (await isHolidayAsync(dateStr)) {
    return false;
  }

  return true;
}

/**
 * Check if a specific employee should work on a given day.
 * Considers: Sunday, holidays, and employee's works_saturday flag.
 */
export async function isWorkingDayForEmployee(dateStr: string, employee: Employee | EmployeeWithLeader): Promise<boolean> {
  const dateObj = new Date(dateStr + 'T12:00:00Z');
  const dayOfWeek = dateObj.getUTCDay(); // 0 = Sunday, 6 = Saturday

  // Sunday - not a working day for anyone
  if (dayOfWeek === 0) {
    return false;
  }

  // Saturday - check if employee works on Saturday
  if (dayOfWeek === 6) {
    // If works_saturday is undefined, default to true (most employees work Saturday)
    const worksSaturday = employee.works_saturday !== false;
    if (!worksSaturday) {
      return false;
    }
  }

  // Check if it's a holiday (static + database)
  if (await isHolidayAsync(dateStr)) {
    return false;
  }

  return true;
}

// ─── Punch Adjustments ────────────────────────────────────────

export interface PunchAdjustmentRequest {
  id: number;
  daily_record_id: number;
  employee_id: number;
  type: 'missing_punch' | 'late_start';
  missing_punches: string[]; // ['entrada', 'saída', 'intervalo', 'retorno']
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  corrected_punch_1?: string | null;
  corrected_punch_2?: string | null;
  corrected_punch_3?: string | null;
  corrected_punch_4?: string | null;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  manager_comment?: string | null;
  submitted_at: string;
  notification_sent?: boolean;
}

export interface PunchAdjustmentFull extends PunchAdjustmentRequest {
  employee_name: string;
  date: string;
  current_punch_1: string | null;
  current_punch_2: string | null;
  current_punch_3: string | null;
  current_punch_4: string | null;
}

export async function insertPunchAdjustmentRequest(data: {
  daily_record_id: number;
  employee_id: number;
  type: 'missing_punch' | 'late_start';
  missing_punches: string[];
  reason: string;
}): Promise<{ id: number }> {
  const id = await getNextId(COLLECTIONS.PUNCH_ADJUSTMENTS);
  const record: PunchAdjustmentRequest = {
    id,
    daily_record_id: data.daily_record_id,
    employee_id: data.employee_id,
    type: data.type,
    missing_punches: data.missing_punches,
    reason: data.reason,
    status: 'pending',
    submitted_at: new Date().toISOString(),
    notification_sent: false,
  };
  await getDb().collection(COLLECTIONS.PUNCH_ADJUSTMENTS).doc(String(id)).set(record);
  invalidateCache('punch_adjustments');
  return { id };
}

export async function getPendingPunchAdjustments(leaderId: number): Promise<PunchAdjustmentFull[]> {
  const employees = await getEmployeesByLeaderId(leaderId);
  const empIds = employees.map(e => e.id);
  if (empIds.length === 0) return [];

  const empMap = new Map(employees.map(e => [e.id, e]));

  // Get all pending adjustments for these employees
  const allAdjustments: PunchAdjustmentRequest[] = [];
  for (const chunk of chunkArray(empIds, 10)) {
    const snap = await getDb().collection(COLLECTIONS.PUNCH_ADJUSTMENTS)
      .where('employee_id', 'in', chunk)
      .where('status', '==', 'pending')
      .get();
    allAdjustments.push(...docsToArray<PunchAdjustmentRequest>(snap));
  }

  // Get daily records for these adjustments
  const recordIds = [...new Set(allAdjustments.map(a => a.daily_record_id))];
  const recordMap = new Map<number, DailyRecord>();
  for (const chunk of chunkArray(recordIds, 30)) {
    const snap = await getDb().collection(COLLECTIONS.DAILY_RECORDS)
      .where('id', 'in', chunk).get();
    for (const doc of snap.docs) {
      const data = doc.data() as DailyRecord;
      recordMap.set(data.id, data);
    }
  }

  return allAdjustments.map(a => {
    const emp = empMap.get(a.employee_id);
    const record = recordMap.get(a.daily_record_id);
    return {
      ...a,
      employee_name: emp?.name ?? '',
      date: record?.date ?? '',
      current_punch_1: record?.punch_1 ?? null,
      current_punch_2: record?.punch_2 ?? null,
      current_punch_3: record?.punch_3 ?? null,
      current_punch_4: record?.punch_4 ?? null,
    };
  }).sort((a, b) => b.submitted_at.localeCompare(a.submitted_at));
}

export async function approvePunchAdjustment(
  adjustmentId: number,
  reviewedBy: string,
  correctedTimes: {
    punch_1?: string | null;
    punch_2?: string | null;
    punch_3?: string | null;
    punch_4?: string | null;
  },
  managerComment?: string
): Promise<boolean> {
  const snap = await getDb().collection(COLLECTIONS.PUNCH_ADJUSTMENTS)
    .where('id', '==', adjustmentId).limit(1).get();
  if (snap.empty) return false;

  const adjustment = snap.docs[0].data() as PunchAdjustmentRequest;

  // Update the adjustment
  await snap.docs[0].ref.update({
    status: 'approved',
    reviewed_by: reviewedBy,
    reviewed_at: new Date().toISOString(),
    manager_comment: managerComment || null,
    corrected_punch_1: correctedTimes.punch_1 ?? null,
    corrected_punch_2: correctedTimes.punch_2 ?? null,
    corrected_punch_3: correctedTimes.punch_3 ?? null,
    corrected_punch_4: correctedTimes.punch_4 ?? null,
  });

  // Update the daily record with corrected times
  const recordSnap = await getDb().collection(COLLECTIONS.DAILY_RECORDS)
    .where('id', '==', adjustment.daily_record_id).limit(1).get();
  if (!recordSnap.empty) {
    const updateData: Record<string, any> = {};
    if (correctedTimes.punch_1 !== undefined) updateData.punch_1 = correctedTimes.punch_1;
    if (correctedTimes.punch_2 !== undefined) updateData.punch_2 = correctedTimes.punch_2;
    if (correctedTimes.punch_3 !== undefined) updateData.punch_3 = correctedTimes.punch_3;
    if (correctedTimes.punch_4 !== undefined) updateData.punch_4 = correctedTimes.punch_4;
    updateData.updated_at = new Date().toISOString();
    // After approval, recalculate classification (will be done by caller)
    await recordSnap.docs[0].ref.update(updateData);
  }

  invalidateCache('punch_adjustments');
  invalidateCache('records');
  return true;
}

export async function rejectPunchAdjustment(
  adjustmentId: number,
  reviewedBy: string,
  managerComment?: string
): Promise<boolean> {
  const snap = await getDb().collection(COLLECTIONS.PUNCH_ADJUSTMENTS)
    .where('id', '==', adjustmentId).limit(1).get();
  if (snap.empty) return false;

  await snap.docs[0].ref.update({
    status: 'rejected',
    reviewed_by: reviewedBy,
    reviewed_at: new Date().toISOString(),
    manager_comment: managerComment || null,
  });

  invalidateCache('punch_adjustments');
  return true;
}

export async function getPunchAdjustmentById(id: number): Promise<PunchAdjustmentRequest | undefined> {
  const snap = await getDb().collection(COLLECTIONS.PUNCH_ADJUSTMENTS)
    .where('id', '==', id).limit(1).get();
  if (snap.empty) return undefined;
  return snap.docs[0].data() as PunchAdjustmentRequest;
}

export async function updateRecordClassification(recordId: number, classification: string): Promise<boolean> {
  const snap = await getDb().collection(COLLECTIONS.DAILY_RECORDS)
    .where('id', '==', recordId).limit(1).get();
  if (snap.empty) return false;

  await snap.docs[0].ref.update({
    classification,
    updated_at: new Date().toISOString(),
  });

  invalidateCache('records');
  return true;
}

export async function markPunchAdjustmentNotificationSent(recordId: number): Promise<void> {
  const snap = await getDb().collection(COLLECTIONS.PUNCH_ADJUSTMENTS)
    .where('daily_record_id', '==', recordId).get();
  for (const doc of snap.docs) {
    await doc.ref.update({ notification_sent: true });
  }
}

export async function getPunchAdjustmentByRecordId(recordId: number): Promise<PunchAdjustmentRequest | undefined> {
  const snap = await getDb().collection(COLLECTIONS.PUNCH_ADJUSTMENTS)
    .where('daily_record_id', '==', recordId).limit(1).get();
  if (snap.empty) return undefined;
  return snap.docs[0].data() as PunchAdjustmentRequest;
}

export async function deletePunchAdjustment(adjustmentId: number): Promise<boolean> {
  const snap = await getDb().collection(COLLECTIONS.PUNCH_ADJUSTMENTS)
    .where('id', '==', adjustmentId).limit(1).get();
  if (snap.empty) return false;
  await snap.docs[0].ref.delete();
  return true;
}

export async function getReviewedPunchAdjustments(): Promise<PunchAdjustmentFull[]> {
  // Query approved and rejected separately to avoid needing composite index
  const [approvedSnap, rejectedSnap] = await Promise.all([
    getDb().collection(COLLECTIONS.PUNCH_ADJUSTMENTS).where('status', '==', 'approved').get(),
    getDb().collection(COLLECTIONS.PUNCH_ADJUSTMENTS).where('status', '==', 'rejected').get(),
  ]);

  const adjustments = [
    ...docsToArray<PunchAdjustmentRequest>(approvedSnap),
    ...docsToArray<PunchAdjustmentRequest>(rejectedSnap),
  ].sort((a, b) => {
    // Sort by reviewed_at descending
    const dateA = a.reviewed_at || '';
    const dateB = b.reviewed_at || '';
    return dateB.localeCompare(dateA);
  });

  // Get employee and record info
  const employees = await getAllEmployees();
  const empMap = new Map(employees.map(e => [e.id, e]));

  const recordIds = [...new Set(adjustments.map(a => a.daily_record_id))];
  const recordMap = new Map<number, DailyRecord>();
  for (const chunk of chunkArray(recordIds, 10)) {
    for (const recordId of chunk) {
      const record = await getDailyRecordById(recordId);
      if (record) recordMap.set(recordId, record);
    }
  }

  return adjustments.map(a => {
    const emp = empMap.get(a.employee_id);
    const record = recordMap.get(a.daily_record_id);
    return {
      ...a,
      employee_name: emp?.name ?? '',
      date: record?.date ?? '',
      current_punch_1: record?.punch_1 ?? null,
      current_punch_2: record?.punch_2 ?? null,
      current_punch_3: record?.punch_3 ?? null,
      current_punch_4: record?.punch_4 ?? null,
      leader_name: emp?.leader_name ?? '',
      leader_id: emp?.leader_id ?? 0,
    };
  });
}
