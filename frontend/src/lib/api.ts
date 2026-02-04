const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function apiFetch<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${res.status}`);
  }

  return res.json();
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

// ─── Records ───────────────────────────────────────────────────

export async function getRecordsByDate(date: string) {
  return apiFetch<{ records: DailyRecord[] }>(`/api/records?date=${date}`);
}

export async function getEmployeeRecords(employeeId: number, start: string, end: string) {
  return apiFetch<{ records: DailyRecord[] }>(`/api/records/employee/${employeeId}?start=${start}&end=${end}`);
}

export async function getLeaderRecords(leaderId: number, start: string, end: string) {
  return apiFetch<{ records: DailyRecord[] }>(`/api/records/leader/${leaderId}?start=${start}&end=${end}`);
}

export async function getAllRecords(start: string, end: string) {
  return apiFetch<{ records: DailyRecord[] }>(`/api/records/all?start=${start}&end=${end}`);
}

// ─── Justifications ────────────────────────────────────────────

export async function getEmployeeJustifications(employeeId: number) {
  return apiFetch<{ justifications: Justification[] }>(`/api/justifications/employee/${employeeId}`);
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
