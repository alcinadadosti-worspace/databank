import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.resolve(__dirname, '../../data/databank.db');

let db: Database.Database;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeSchema(db);
  }
  return db;
}

function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS leaders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      name_normalized TEXT NOT NULL,
      slack_id TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS employees (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slack_id TEXT,
      leader_id INTEGER NOT NULL,
      secondary_approver_id INTEGER,
      solides_employee_id TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (leader_id) REFERENCES leaders(id),
      FOREIGN KEY (secondary_approver_id) REFERENCES leaders(id)
    );

    CREATE TABLE IF NOT EXISTS daily_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      employee_id INTEGER NOT NULL,
      date TEXT NOT NULL,
      punch_1 TEXT,
      punch_2 TEXT,
      punch_3 TEXT,
      punch_4 TEXT,
      total_worked_minutes INTEGER,
      difference_minutes INTEGER,
      classification TEXT CHECK(classification IN ('normal', 'late', 'overtime')),
      alert_sent INTEGER DEFAULT 0,
      manager_alert_sent INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (employee_id) REFERENCES employees(id),
      UNIQUE(employee_id, date)
    );

    CREATE TABLE IF NOT EXISTS justifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      daily_record_id INTEGER NOT NULL,
      employee_id INTEGER NOT NULL,
      type TEXT CHECK(type IN ('late', 'overtime')) NOT NULL,
      reason TEXT NOT NULL,
      custom_note TEXT,
      submitted_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (daily_record_id) REFERENCES daily_records(id),
      FOREIGN KEY (employee_id) REFERENCES employees(id)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      details TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slack_id TEXT UNIQUE,
      name TEXT NOT NULL,
      role TEXT CHECK(role IN ('employee', 'manager', 'admin')) NOT NULL DEFAULT 'employee',
      employee_id INTEGER,
      leader_id INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (employee_id) REFERENCES employees(id),
      FOREIGN KEY (leader_id) REFERENCES leaders(id)
    );

    CREATE INDEX IF NOT EXISTS idx_daily_records_date ON daily_records(date);
    CREATE INDEX IF NOT EXISTS idx_daily_records_employee ON daily_records(employee_id);
    CREATE INDEX IF NOT EXISTS idx_justifications_record ON justifications(daily_record_id);
    CREATE INDEX IF NOT EXISTS idx_employees_leader ON employees(leader_id);
  `);
}

export function closeDb(): void {
  if (db) {
    db.close();
  }
}
