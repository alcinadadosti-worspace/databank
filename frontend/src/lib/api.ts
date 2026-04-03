const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Token storage keys
const ADMIN_TOKEN_KEY = 'databank_admin_token';
const MANAGER_TOKEN_KEY = 'databank_manager_token';

// Get stored token
export function getAuthToken(type: 'admin' | 'manager'): string | null {
  if (typeof window === 'undefined') return null;
  const key = type === 'admin' ? ADMIN_TOKEN_KEY : MANAGER_TOKEN_KEY;
  return localStorage.getItem(key);
}

// Store token
export function setAuthToken(type: 'admin' | 'manager', token: string): void {
  if (typeof window === 'undefined') return;
  const key = type === 'admin' ? ADMIN_TOKEN_KEY : MANAGER_TOKEN_KEY;
  localStorage.setItem(key, token);
}

// Remove token
export function removeAuthToken(type: 'admin' | 'manager'): void {
  if (typeof window === 'undefined') return;
  const key = type === 'admin' ? ADMIN_TOKEN_KEY : MANAGER_TOKEN_KEY;
  localStorage.removeItem(key);
}

async function apiFetch<T>(endpoint: string, options?: RequestInit & { authType?: 'admin' | 'manager' }): Promise<T> {
  const { authType, ...fetchOptions } = options || {};

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(fetchOptions.headers as Record<string, string> || {}),
  };

  // Add auth token if available
  if (authType) {
    const token = getAuthToken(authType);
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...fetchOptions,
    headers,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return res.json();
}

// ─── Pagination Types ──────────────────────────────────────────

export interface PaginationParams {
  limit?: number;
  offset?: number;
}

export interface PaginationInfo {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

// ─── Auth ──────────────────────────────────────────────────────

export async function identifyUser(slackId: string) {
  return apiFetch<{ user: User }>('/api/auth/identify', {
    method: 'POST',
    body: JSON.stringify({ slack_id: slackId }),
  });
}

// ─── Employees ─────────────────────────────────────────────────

export async function getEmployees() {
  return apiFetch<{ employees: Employee[] }>('/api/employees');
}

export async function getEmployeesByLeader(leaderId: number) {
  return apiFetch<{ employees: Employee[] }>(`/api/employees/leader/${leaderId}`);
}

// ─── Leaders ───────────────────────────────────────────────────

export async function getLeaders(sector?: string) {
  const params = sector ? `?sector=${encodeURIComponent(sector)}` : '';
  return apiFetch<{ leaders: Leader[]; sectors: string[] }>(`/api/leaders${params}`);
}

export async function getLeaderWithEmployees(leaderId: number) {
  return apiFetch<{ leader: Leader; employees: Employee[] }>(`/api/leaders/${leaderId}`);
}

export interface ManagerAuth {
  id: number;
  name: string;
  email: string;
  isAdmin?: boolean;
}

export async function authenticateManager(email: string) {
  const result = await apiFetch<{ success: boolean; token: string; leader: ManagerAuth }>('/api/leaders/auth', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });

  // Store token if successful
  if (result.success && result.token) {
    setAuthToken('manager', result.token);
  }

  return result;
}

export async function authenticateAdmin(password: string) {
  const result = await apiFetch<{ success: boolean; token: string; admin: { name: string; authenticated: boolean } }>('/api/leaders/auth-admin', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });

  // Store token if successful
  if (result.success && result.token) {
    setAuthToken('admin', result.token);
  }

  return result;
}

export async function verifyAdminToken(): Promise<boolean> {
  try {
    await apiFetch<{ valid: boolean }>('/api/leaders/verify', { authType: 'admin' });
    return true;
  } catch {
    return false;
  }
}

export async function verifyManagerToken(): Promise<boolean> {
  try {
    await apiFetch<{ valid: boolean }>('/api/leaders/verify', { authType: 'manager' });
    return true;
  } catch {
    return false;
  }
}

// ─── Records ───────────────────────────────────────────────────

export async function getRecordsByDate(date: string) {
  return apiFetch<{ records: DailyRecord[] }>(`/api/records?date=${date}`);
}

export async function getEmployeeRecords(employeeId: number, start: string, end: string) {
  return apiFetch<{ records: DailyRecord[] }>(`/api/records/employee/${employeeId}?start=${start}&end=${end}`);
}

export async function getLeaderRecords(
  leaderId: number,
  start: string,
  end: string,
  pagination?: PaginationParams
) {
  let url = `/api/records/leader/${leaderId}?start=${start}&end=${end}`;
  if (pagination?.limit !== undefined && pagination?.offset !== undefined) {
    url += `&limit=${pagination.limit}&offset=${pagination.offset}`;
  }
  return apiFetch<{ records: DailyRecord[]; pagination?: PaginationInfo }>(url);
}

export async function getAllRecords(
  start: string,
  end: string,
  pagination?: PaginationParams
) {
  let url = `/api/records/all?start=${start}&end=${end}`;
  if (pagination?.limit !== undefined && pagination?.offset !== undefined) {
    url += `&limit=${pagination.limit}&offset=${pagination.offset}`;
  }
  return apiFetch<{ records: DailyRecord[]; pagination?: PaginationInfo }>(url);
}

// ─── Justifications ────────────────────────────────────────────

export async function getEmployeeJustifications(employeeId: number) {
  return apiFetch<{ justifications: Justification[] }>(`/api/justifications/employee/${employeeId}`);
}

export async function getPendingJustifications(
  leaderId: number,
  pagination?: PaginationParams
) {
  let url = `/api/justifications/leader/${leaderId}/pending`;
  if (pagination?.limit !== undefined && pagination?.offset !== undefined) {
    url += `?limit=${pagination.limit}&offset=${pagination.offset}`;
  }
  return apiFetch<{ justifications: JustificationFull[]; pagination?: PaginationInfo }>(url);
}

export async function approveJustification(justificationId: number, reviewedBy: string, comment: string) {
  return apiFetch<{ success: boolean; message: string }>(`/api/justifications/${justificationId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ reviewedBy, comment }),
  });
}

export async function rejectJustification(justificationId: number, reviewedBy: string, comment: string) {
  return apiFetch<{ success: boolean; message: string }>(`/api/justifications/${justificationId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reviewedBy, comment }),
  });
}

export async function getReviewedJustifications(pagination?: PaginationParams) {
  let url = '/api/justifications/reviewed';
  if (pagination?.limit !== undefined && pagination?.offset !== undefined) {
    url += `?limit=${pagination.limit}&offset=${pagination.offset}`;
  }
  return apiFetch<{ justifications: JustificationFull[]; pagination?: PaginationInfo }>(url);
}

export async function deleteJustification(justificationId: number) {
  return apiFetch<{ success: boolean; message: string }>(`/api/justifications/${justificationId}`, {
    method: 'DELETE',
  });
}

export async function uploadJustificationAtestado(justificationId: number, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';
  const token = typeof window !== 'undefined' ? localStorage.getItem('databank_token_manager') || localStorage.getItem('databank_token_admin') : null;
  const res = await fetch(`${API_BASE}/api/justifications/${justificationId}/atestado`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).error || 'Falha ao enviar atestado');
  }
  return res.json() as Promise<{ success: boolean; attachment_url: string; attachment_name: string }>;
}

export async function deleteMultipleJustifications(ids: number[]) {
  return apiFetch<{ success: boolean; deleted: number; message: string }>('/api/justifications/bulk-delete', {
    method: 'POST',
    body: JSON.stringify({ ids }),
  });
}

export interface JustificationFull {
  id: number;
  daily_record_id: number;
  employee_id: number;
  type: string;
  reason: string;
  custom_note: string | null;
  attachment_url?: string | null;
  attachment_name?: string | null;
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
  // Punch data
  punch_1?: string | null;
  punch_2?: string | null;
  punch_3?: string | null;
  punch_4?: string | null;
  difference_minutes?: number | null;
  classification?: string | null;
}

export async function submitJustification(data: {
  daily_record_id: number;
  employee_id: number;
  type: 'late' | 'overtime';
  reason: string;
  custom_note?: string;
}) {
  return apiFetch<{ id: number }>('/api/justifications', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

// ─── Admin ─────────────────────────────────────────────────────

export async function getDashboardStats() {
  return apiFetch<DashboardStats>('/api/admin/dashboard');
}

export async function getAuditLogs(limit = 100, offset = 0) {
  return apiFetch<{ logs: AuditLog[] }>(`/api/admin/audit-logs?limit=${limit}&offset=${offset}`);
}

export function getExportUrl(start: string, end: string) {
  return `${API_BASE}/api/admin/export?start=${start}&end=${end}`;
}

export async function resyncPunches(date: string) {
  return apiFetch<{ success: boolean; message: string }>('/api/admin/resync', {
    method: 'POST',
    body: JSON.stringify({ date }),
  });
}

export async function testSlackMessage(type: 'employee' | 'manager') {
  return apiFetch<{ success: boolean; message: string }>('/api/admin/test-slack', {
    method: 'POST',
    body: JSON.stringify({ type }),
  });
}

export async function testPunchReminder(type: 'entry' | 'lunch_return' | 'exit') {
  return apiFetch<{ success: boolean; message: string }>('/api/admin/test-reminder', {
    method: 'POST',
    body: JSON.stringify({ type }),
  });
}

export interface SyncStartResult {
  success: boolean;
  message: string;
  jobId: string;
  totalDays: number;
}

export interface SyncStatus {
  id: string;
  status: 'running' | 'completed' | 'error';
  startDate: string;
  endDate: string;
  totalDays: number;
  synced: number;
  errors: number;
  currentDate?: string;
  startedAt: string;
  completedAt?: string;
  errorMessage?: string;
}

export async function syncPunchesRange(startDate: string, endDate: string) {
  return apiFetch<SyncStartResult>('/api/admin/sync-range', {
    method: 'POST',
    body: JSON.stringify({ startDate, endDate }),
  });
}

export async function getSyncStatus(jobId: string) {
  return apiFetch<SyncStatus>(`/api/admin/sync-status/${jobId}`);
}

// ─── Manager Sync ───────────────────────────────────────────────

export async function syncManagerPunches(leaderId: number, startDate: string, endDate: string) {
  return apiFetch<SyncStartResult>(`/api/leaders/${leaderId}/sync`, {
    method: 'POST',
    body: JSON.stringify({ startDate, endDate }),
  });
}

export async function getManagerSyncStatus(jobId: string) {
  return apiFetch<SyncStatus>(`/api/leaders/sync-status/${jobId}`);
}

// ─── Units ────────────────────────────────────────────────────

export async function getUnitRecords(date: string) {
  return apiFetch<{ units: UnitData[]; date: string; is_holiday: boolean }>(`/api/records/units?date=${date}`);
}

// ─── Record Editing ───────────────────────────────────────────

export interface EditRecordData {
  punch_1: string | null;
  punch_2: string | null;
  punch_3: string | null;
  punch_4: string | null;
  editedBy?: string;
  reason?: string;
}

export interface EditRecordResult {
  success: boolean;
  message: string;
  record: {
    id: number;
    punch_1: string | null;
    punch_2: string | null;
    punch_3: string | null;
    punch_4: string | null;
    total_worked_minutes: number | null;
    difference_minutes: number | null;
    classification: string | null;
  };
}

export async function editRecord(recordId: number, data: EditRecordData) {
  return apiFetch<EditRecordResult>(`/api/admin/record/${recordId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

// ─── Types ─────────────────────────────────────────────────────

export interface User {
  id: number;
  slack_id: string;
  name: string;
  role: 'employee' | 'manager' | 'admin';
  employee_id: number | null;
  leader_id: number | null;
}

export interface Employee {
  id: number;
  name: string;
  slack_id: string | null;
  leader_id: number;
  secondary_approver_id: number | null;
  leader_name?: string;
  leader_slack_id?: string | null;
  sector?: string | null;
}

export interface Leader {
  id: number;
  name: string;
  name_normalized: string;
  slack_id: string | null;
  sector: string | null;
  parent_leader_id: number | null;
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
  classification: 'normal' | 'late' | 'overtime' | null;
  employee_name?: string;
  employee_slack_id?: string | null;
  leader_name?: string;
  justification_reason?: string | null;
  justification_type?: string | null;
  justification_status?: 'pending' | 'approved' | 'rejected' | null;
}

export interface Justification {
  id: number;
  daily_record_id: number;
  employee_id: number;
  type: string;
  reason: string;
  custom_note: string | null;
  submitted_at: string;
  date: string;
}

export interface DashboardStats {
  total_employees: number;
  total_leaders: number;
  today_records: number;
  today_alerts: number;
  pending_justifications: number;
}

export interface AuditLog {
  id: number;
  action: string;
  entity_type: string;
  entity_id: number | null;
  details: string | null;
  created_at: string;
}

export interface UnitEmployee {
  id: number;
  name: string;
  punch_1: string | null;
  punch_2: string | null;
  punch_3: string | null;
  punch_4: string | null;
  present: boolean;
  is_apprentice: boolean;
  is_intern?: boolean;
  no_punch_required: boolean;
  is_on_vacation: boolean;
  is_on_folga: boolean;
  folga_type: 'integral' | 'partial' | null;
}

export interface UnitData {
  leader_id: number;
  unit_name: string;
  leader_name: string;
  employees: UnitEmployee[];
  present_count: number;
  total_count: number;
}

// ─── Holidays ─────────────────────────────────────────────────

export interface Holiday {
  id: number;
  date: string;
  name: string;
  type: 'national' | 'state' | 'municipal' | 'company';
  recurring: boolean;
  employee_ids?: number[];
  created_at: string;
}

export async function getHolidays() {
  return apiFetch<{ holidays: Holiday[] }>('/api/holidays');
}

export async function getHolidaysForYear(year: number) {
  return apiFetch<{ holidays: Holiday[]; year: number }>(`/api/holidays/year/${year}`);
}

export async function checkHoliday(date: string) {
  return apiFetch<{ isHoliday: boolean; holiday: Holiday | null }>(`/api/holidays/check/${date}`);
}

export async function createHoliday(data: {
  date: string;
  name: string;
  type: Holiday['type'];
  recurring: boolean;
  employee_ids?: number[];
}) {
  return apiFetch<{ success: boolean; id: number; message: string }>('/api/holidays', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateHoliday(id: number, data: {
  date: string;
  name: string;
  type: Holiday['type'];
  recurring: boolean;
  employee_ids?: number[];
}) {
  return apiFetch<{ success: boolean; message: string }>(`/api/holidays/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteHoliday(id: number) {
  return apiFetch<{ success: boolean; message: string }>(`/api/holidays/${id}`, {
    method: 'DELETE',
  });
}

// ─── Punch Adjustments ─────────────────────────────────────────

export interface PunchAdjustmentFull {
  id: number;
  daily_record_id: number;
  employee_id: number;
  type: 'missing_punch' | 'late_start';
  missing_punches: string[];
  reason: string;
  status: 'pending' | 'approved' | 'rejected';
  corrected_punch_1?: string | null;
  corrected_punch_2?: string | null;
  corrected_punch_3?: string | null;
  corrected_punch_4?: string | null;
  reviewed_by?: string;
  reviewed_at?: string;
  manager_comment?: string;
  submitted_at: string;
  // Joined fields
  employee_name: string;
  date: string;
  current_punch_1: string | null;
  current_punch_2: string | null;
  current_punch_3: string | null;
  current_punch_4: string | null;
}

export async function getPendingPunchAdjustments(leaderId: number) {
  return apiFetch<{ adjustments: PunchAdjustmentFull[] }>(`/api/punch-adjustments/leader/${leaderId}/pending`);
}

export async function approvePunchAdjustment(
  adjustmentId: number,
  reviewedBy: string,
  comment: string,
  correctedTimes: {
    corrected_punch_1?: string | null;
    corrected_punch_2?: string | null;
    corrected_punch_3?: string | null;
    corrected_punch_4?: string | null;
  }
) {
  return apiFetch<{ success: boolean; message: string }>(`/api/punch-adjustments/${adjustmentId}/approve`, {
    method: 'POST',
    body: JSON.stringify({ reviewedBy, comment, ...correctedTimes }),
  });
}

export async function rejectPunchAdjustment(adjustmentId: number, reviewedBy: string, comment: string) {
  return apiFetch<{ success: boolean; message: string }>(`/api/punch-adjustments/${adjustmentId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reviewedBy, comment }),
  });
}

export async function deletePunchAdjustment(adjustmentId: number) {
  return apiFetch<{ success: boolean; message: string }>(`/api/punch-adjustments/${adjustmentId}`, {
    method: 'DELETE',
  });
}

export async function getReviewedPunchAdjustments() {
  return apiFetch<{ adjustments: PunchAdjustmentFull[] }>('/api/punch-adjustments/reviewed');
}

// ─── Reports ─────────────────────────────────────────────────────

export interface Report {
  id: number;
  title: string;
  description?: string;
  filename: string;
  fileUrl: string;
  fileSize: number;
  weekStart?: string;
  weekEnd?: string;
  uploadedAt: string;
  uploadedBy?: string;
}

export async function getReports() {
  return apiFetch<{ reports: Report[] }>('/api/reports');
}

export async function uploadReport(formData: FormData) {
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  const res = await fetch(`${API_BASE}/api/reports`, {
    method: 'POST',
    body: formData, // Don't set Content-Type header - browser will set it with boundary
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return res.json() as Promise<{ success: boolean; report: Report }>;
}

export async function deleteReport(reportId: number) {
  return apiFetch<{ success: boolean; message: string }>(`/api/reports/${reportId}`, {
    method: 'DELETE',
  });
}

// ─── Vacations ─────────────────────────────────────────────────────

export interface Vacation {
  id: number;
  employee_id: number;
  start_date: string;
  end_date: string;
  days: number;
  notes?: string | null;
  created_at: string;
  created_by?: string | null;
  employee_name?: string;
  leader_name?: string;
}

export async function getVacations() {
  return apiFetch<{ vacations: Vacation[] }>('/api/vacations');
}

export async function getActiveVacations(date?: string) {
  const params = date ? `?date=${date}` : '';
  return apiFetch<{ vacations: Vacation[] }>(`/api/vacations/active${params}`);
}

export async function checkEmployeeVacation(employeeId: number, date?: string) {
  const params = date ? `?date=${date}` : '';
  return apiFetch<{ employeeId: number; isOnVacation: boolean; date: string }>(
    `/api/vacations/check/${employeeId}${params}`
  );
}

export async function getEmployeeVacations(employeeId: number) {
  return apiFetch<{ vacations: Vacation[] }>(`/api/vacations/employee/${employeeId}`);
}

export async function createVacation(data: {
  employee_id: number;
  start_date: string;
  end_date: string;
  days: number;
  notes?: string;
}) {
  return apiFetch<{ success: boolean; id: number; message: string }>('/api/vacations', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateVacation(id: number, data: {
  start_date: string;
  end_date: string;
  days: number;
  notes?: string;
}) {
  return apiFetch<{ success: boolean; message: string }>(`/api/vacations/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteVacation(id: number) {
  return apiFetch<{ success: boolean; message: string }>(`/api/vacations/${id}`, {
    method: 'DELETE',
  });
}

// ─── Vacation Schedules (Vencimentos de Férias) ────────────────────────────

export interface VacationSchedule {
  id: number;
  employee_id: number;
  period_1_date: string;
  period_2_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  employee_name?: string;
  leader_name?: string;
}

export async function getVacationSchedules() {
  return apiFetch<{ schedules: VacationSchedule[] }>('/api/vacation-schedules');
}

export async function createVacationSchedule(data: {
  employee_id: number;
  period_1_date: string;
  period_2_date?: string | null;
  notes?: string;
}) {
  return apiFetch<{ success: boolean; id: number; message: string }>('/api/vacation-schedules', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateVacationSchedule(id: number, data: {
  period_1_date: string;
  period_2_date?: string | null;
  notes?: string;
}) {
  return apiFetch<{ success: boolean; message: string }>(`/api/vacation-schedules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteVacationSchedule(id: number) {
  return apiFetch<{ success: boolean; message: string }>(`/api/vacation-schedules/${id}`, {
    method: 'DELETE',
  });
}

// ─── Folgas Agendadas ──────────────────────────────────────────

export interface Folga {
  id: number;
  employee_id: number;
  leader_id: number;
  date: string;
  type: 'integral' | 'partial';
  hours_off: number;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  employee_name?: string;
  leader_name?: string;
}

export async function getFolgas() {
  return apiFetch<{ folgas: Folga[] }>('/api/folgas');
}

export async function getFolgasByLeader(leaderId: number) {
  return apiFetch<{ folgas: Folga[] }>(`/api/folgas/leader/${leaderId}`);
}

export async function createFolga(data: {
  employee_id: number;
  leader_id: number;
  date: string;
  type: 'integral' | 'partial';
  hours_off?: number;
  notes?: string;
}) {
  return apiFetch<{ success: boolean; id: number; message: string }>('/api/folgas', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export async function updateFolga(id: number, data: {
  date: string;
  type: 'integral' | 'partial';
  hours_off?: number;
  notes?: string;
}) {
  return apiFetch<{ success: boolean; message: string }>(`/api/folgas/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  });
}

export async function deleteFolga(id: number) {
  return apiFetch<{ success: boolean; message: string }>(`/api/folgas/${id}`, {
    method: 'DELETE',
  });
}
