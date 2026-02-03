import { getDb } from './database';

// ─── Leaders ───────────────────────────────────────────────────

export function getAllLeaders() {
  return getDb().prepare('SELECT * FROM leaders ORDER BY name').all() as Leader[];
}

export function getLeaderById(id: number) {
  return getDb().prepare('SELECT * FROM leaders WHERE id = ?').get(id) as Leader | undefined;
}

export function getLeaderBySlackId(slackId: string) {
  return getDb().prepare('SELECT * FROM leaders WHERE slack_id = ?').get(slackId) as Leader | undefined;
}

export function getLeaderByName(name: string) {
  return getDb().prepare('SELECT * FROM leaders WHERE name_normalized = ?').get(name.toLowerCase()) as Leader | undefined;
}

export function insertLeader(name: string, nameNormalized: string, slackId: string | null) {
  return getDb().prepare(
    'INSERT INTO leaders (name, name_normalized, slack_id) VALUES (?, ?, ?)'
  ).run(name, nameNormalized, slackId);
}

// ─── Employees ─────────────────────────────────────────────────

export function getAllEmployees() {
  return getDb().prepare(`
    SELECT e.*, l.name as leader_name, l.slack_id as leader_slack_id
    FROM employees e
    JOIN leaders l ON e.leader_id = l.id
    ORDER BY e.name
  `).all() as EmployeeWithLeader[];
}

export function getEmployeesByLeaderId(leaderId: number) {
  return getDb().prepare(`
    SELECT e.*, l.name as leader_name
    FROM employees e
    JOIN leaders l ON e.leader_id = l.id
    WHERE e.leader_id = ? OR e.secondary_approver_id = ?
    ORDER BY e.name
  `).all(leaderId, leaderId) as EmployeeWithLeader[];
}

export function getEmployeeBySlackId(slackId: string) {
  return getDb().prepare('SELECT * FROM employees WHERE slack_id = ?').get(slackId) as Employee | undefined;
}

export function getEmployeeById(id: number) {
  return getDb().prepare('SELECT * FROM employees WHERE id = ?').get(id) as Employee | undefined;
}

export function insertEmployee(
  name: string,
  slackId: string | null,
  leaderId: number,
  secondaryApproverId: number | null
) {
  return getDb().prepare(
    'INSERT INTO employees (name, slack_id, leader_id, secondary_approver_id) VALUES (?, ?, ?, ?)'
  ).run(name, slackId, leaderId, secondaryApproverId);
}

export function updateEmployeeSolidesId(employeeId: number, solidesId: string) {
  return getDb().prepare(
    'UPDATE employees SET solides_employee_id = ? WHERE id = ?'
  ).run(solidesId, employeeId);
}

// ─── Daily Records ─────────────────────────────────────────────

export function getDailyRecord(employeeId: number, date: string) {
  return getDb().prepare(
    'SELECT * FROM daily_records WHERE employee_id = ? AND date = ?'
  ).get(employeeId, date) as DailyRecord | undefined;
}

export function getDailyRecordsByDate(date: string) {
  return getDb().prepare(`
    SELECT dr.*, e.name as employee_name, e.slack_id as employee_slack_id,
           l.name as leader_name, l.slack_id as leader_slack_id, e.leader_id
    FROM daily_records dr
    JOIN employees e ON dr.employee_id = e.id
    JOIN leaders l ON e.leader_id = l.id
    WHERE dr.date = ?
    ORDER BY e.name
  `).all(date) as DailyRecordFull[];
}

export function getDailyRecordsByEmployeeRange(employeeId: number, startDate: string, endDate: string) {
  return getDb().prepare(`
    SELECT dr.*, j.reason as justification_reason, j.type as justification_type
    FROM daily_records dr
    LEFT JOIN justifications j ON j.daily_record_id = dr.id
    WHERE dr.employee_id = ? AND dr.date BETWEEN ? AND ?
    ORDER BY dr.date DESC
  `).all(employeeId, startDate, endDate) as DailyRecordWithJustification[];
}

export function getDailyRecordsByLeaderRange(leaderId: number, startDate: string, endDate: string) {
  return getDb().prepare(`
    SELECT dr.*, e.name as employee_name, e.slack_id as employee_slack_id,
           j.reason as justification_reason, j.type as justification_type
    FROM daily_records dr
    JOIN employees e ON dr.employee_id = e.id
    LEFT JOIN justifications j ON j.daily_record_id = dr.id
    WHERE (e.leader_id = ? OR e.secondary_approver_id = ?)
      AND dr.date BETWEEN ? AND ?
    ORDER BY dr.date DESC, e.name
  `).all(leaderId, leaderId, startDate, endDate) as DailyRecordFull[];
}

export function getAllRecordsRange(startDate: string, endDate: string) {
  return getDb().prepare(`
    SELECT dr.*, e.name as employee_name, e.slack_id as employee_slack_id,
           l.name as leader_name, l.slack_id as leader_slack_id, e.leader_id,
           j.reason as justification_reason, j.type as justification_type
    FROM daily_records dr
    JOIN employees e ON dr.employee_id = e.id
    JOIN leaders l ON e.leader_id = l.id
    LEFT JOIN justifications j ON j.daily_record_id = dr.id
    WHERE dr.date BETWEEN ? AND ?
    ORDER BY dr.date DESC, e.name
  `).all(startDate, endDate) as DailyRecordFull[];
}

export function upsertDailyRecord(
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
  return getDb().prepare(`
    INSERT INTO daily_records (employee_id, date, punch_1, punch_2, punch_3, punch_4,
      total_worked_minutes, difference_minutes, classification, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    ON CONFLICT(employee_id, date) DO UPDATE SET
      punch_1 = excluded.punch_1,
      punch_2 = excluded.punch_2,
      punch_3 = excluded.punch_3,
      punch_4 = excluded.punch_4,
      total_worked_minutes = excluded.total_worked_minutes,
      difference_minutes = excluded.difference_minutes,
      classification = excluded.classification,
      updated_at = datetime('now')
  `).run(employeeId, date, punch1, punch2, punch3, punch4, totalWorkedMinutes, differenceMinutes, classification);
}

export function markAlertSent(recordId: number) {
  return getDb().prepare('UPDATE daily_records SET alert_sent = 1 WHERE id = ?').run(recordId);
}

export function markManagerAlertSent(date: string) {
  return getDb().prepare('UPDATE daily_records SET manager_alert_sent = 1 WHERE date = ?').run(date);
}

export function getUnalertedRecords(date: string) {
  return getDb().prepare(`
    SELECT dr.*, e.name as employee_name, e.slack_id as employee_slack_id,
           l.name as leader_name, l.slack_id as leader_slack_id, e.leader_id
    FROM daily_records dr
    JOIN employees e ON dr.employee_id = e.id
    JOIN leaders l ON e.leader_id = l.id
    WHERE dr.date = ? AND dr.alert_sent = 0
      AND dr.classification IN ('late', 'overtime')
      AND ABS(dr.difference_minutes) >= 11
  `).all(date) as DailyRecordFull[];
}

// ─── Justifications ────────────────────────────────────────────

export function insertJustification(
  dailyRecordId: number,
  employeeId: number,
  type: 'late' | 'overtime',
  reason: string,
  customNote?: string
) {
  return getDb().prepare(
    'INSERT INTO justifications (daily_record_id, employee_id, type, reason, custom_note) VALUES (?, ?, ?, ?, ?)'
  ).run(dailyRecordId, employeeId, type, reason, customNote || null);
}

export function getJustificationsByEmployee(employeeId: number) {
  return getDb().prepare(`
    SELECT j.*, dr.date
    FROM justifications j
    JOIN daily_records dr ON j.daily_record_id = dr.id
    WHERE j.employee_id = ?
    ORDER BY dr.date DESC
  `).all(employeeId) as JustificationWithDate[];
}

// ─── Audit Log ─────────────────────────────────────────────────

export function logAudit(action: string, entityType: string, entityId?: number, details?: string) {
  return getDb().prepare(
    'INSERT INTO audit_log (action, entity_type, entity_id, details) VALUES (?, ?, ?, ?)'
  ).run(action, entityType, entityId || null, details || null);
}

export function getAuditLogs(limit = 100, offset = 0) {
  return getDb().prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ? OFFSET ?').all(limit, offset);
}

// ─── Users ─────────────────────────────────────────────────────

export function getUserBySlackId(slackId: string) {
  return getDb().prepare('SELECT * FROM users WHERE slack_id = ?').get(slackId) as User | undefined;
}

export function upsertUser(slackId: string, name: string, role: string, employeeId?: number, leaderId?: number) {
  return getDb().prepare(`
    INSERT INTO users (slack_id, name, role, employee_id, leader_id)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(slack_id) DO UPDATE SET
      name = excluded.name,
      role = excluded.role,
      employee_id = excluded.employee_id,
      leader_id = excluded.leader_id
  `).run(slackId, name, role, employeeId || null, leaderId || null);
}

// ─── Types ─────────────────────────────────────────────────────

export interface Leader {
  id: number;
  name: string;
  name_normalized: string;
  slack_id: string | null;
  created_at: string;
}

export interface Employee {
  id: number;
  name: string;
  slack_id: string | null;
  leader_id: number;
  secondary_approver_id: number | null;
  solides_employee_id: string | null;
  created_at: string;
}

export interface EmployeeWithLeader extends Employee {
  leader_name: string;
  leader_slack_id?: string | null;
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

export interface User {
  id: number;
  slack_id: string;
  name: string;
  role: string;
  employee_id: number | null;
  leader_id: number | null;
  created_at: string;
}
