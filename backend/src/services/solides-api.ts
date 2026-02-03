/**
 * Sólides Tangerino API Client - READ-ONLY
 *
 * CRITICAL: This client ONLY reads data from the Sólides API.
 * It NEVER creates, updates, or deletes any data.
 * Only GET requests are allowed.
 *
 * API Structure:
 *   - Employees: https://employer.tangerino.com.br/employee/find-all
 *   - Punches:   https://apis.tangerino.com.br/punch/ (dates in milliseconds)
 *   - Hours:     https://apis.tangerino.com.br/punch/hoursBalance
 */

import { env } from '../config/env';
import { logAudit } from '../models/queries';

const EMPLOYER_URL = 'https://employer.tangerino.com.br';
const PUNCH_URL = 'https://apis.tangerino.com.br/punch';
const TOKEN = env.SOLIDES_API_TOKEN;

async function readOnlyFetch(baseUrl: string, endpoint: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(`${baseUrl}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => url.searchParams.append(key, value));
  }

  logAudit('API_READ', 'solides', undefined, `GET ${baseUrl}${endpoint}`);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Authorization': TOKEN,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Sólides API error ${response.status} on ${endpoint}: ${errorText}`);
  }

  return response.json();
}

/** Convert YYYY-MM-DD to epoch milliseconds (start of day, Sao Paulo TZ -3) */
function dateToMillis(dateStr: string, endOfDay = false): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  // Adjust for -3 timezone
  date.setHours(endOfDay ? 23 : 0, endOfDay ? 59 : 0, endOfDay ? 59 : 0, 0);
  // Add 3 hours to convert local -3 to UTC
  const utcMillis = date.getTime() + (3 * 60 * 60 * 1000);
  return String(utcMillis);
}

// ─── Employees ─────────────────────────────────────────────────

/** Fetch all employees (paginated). Returns all pages. */
export async function fetchAllEmployees(): Promise<SolidesEmployee[]> {
  const allEmployees: SolidesEmployee[] = [];
  let page = 0;
  let totalPages = 1;

  while (page < totalPages) {
    const data = await readOnlyFetch(EMPLOYER_URL, '/employee/find-all', {
      page: String(page),
      size: '100',
      showFired: 'false',
    });

    totalPages = data.totalPages || 1;
    const employees = data.content || [];

    for (const emp of employees) {
      allEmployees.push({
        id: String(emp.id),
        name: emp.name,
        cpf: emp.cpf || undefined,
        email: emp.email || undefined,
        companyId: emp.company?.id ? String(emp.company.id) : undefined,
        managerId: emp.lastManager?.id ? String(emp.lastManager.id) : undefined,
        fired: emp.fired || false,
      });
    }

    page++;
  }

  console.log(`[solides] Fetched ${allEmployees.length} employees (${totalPages} pages)`);
  return allEmployees;
}

// ─── Punches ───────────────────────────────────────────────────

/**
 * Fetch punch records for a date range.
 * Each punch record = one entry/exit pair (dateIn + dateOut).
 * A full day with 4 punches = 2 punch records.
 *
 * @param startDate YYYY-MM-DD
 * @param endDate YYYY-MM-DD
 * @param employeeId optional Tangerino employee ID
 */
export async function fetchPunches(
  startDate: string,
  endDate: string,
  employeeId?: string
): Promise<SolidesPunchRecord[]> {
  const allPunches: SolidesPunchRecord[] = [];
  let page = 0;
  let totalPages = 1;

  const params: Record<string, string> = {
    startDate: dateToMillis(startDate),
    endDate: dateToMillis(endDate, true),
    page: '0',
    size: '100',
    status: 'APPROVED',
  };

  if (employeeId) {
    params.employeeId = employeeId;
  }

  while (page < totalPages) {
    params.page = String(page);
    const data = await readOnlyFetch(PUNCH_URL, '/', params);

    totalPages = data.totalPages || 1;
    const punches = data.content || [];

    for (const p of punches) {
      allPunches.push({
        id: String(p.id),
        employeeId: String(p.employeeId || p.employee?.id),
        employeeName: p.employeeName || p.employee?.name || '',
        date: p.date,
        dateIn: p.dateIn,
        dateOut: p.dateOut,
        type: p.type,
        status: p.status,
      });
    }

    page++;
  }

  return allPunches;
}

/**
 * Fetch hours balance for an employee in a date range.
 * Dates must be in milliseconds.
 */
export async function fetchHoursBalance(
  employeeId: string,
  startDate: string,
  endDate: string
): Promise<any> {
  return readOnlyFetch(PUNCH_URL, '/hoursBalance', {
    employeeId,
    startDate: dateToMillis(startDate),
    endDate: dateToMillis(endDate, true),
  });
}

// ─── Types ─────────────────────────────────────────────────────

export interface SolidesEmployee {
  id: string;
  name: string;
  cpf?: string;
  email?: string;
  companyId?: string;
  managerId?: string;
  fired: boolean;
}

export interface SolidesPunchRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  date: string;          // "YYYY-MM-DD"
  dateIn: number;        // epoch millis
  dateOut: number | null; // epoch millis or null if not clocked out
  type: number;
  status: string;
}
