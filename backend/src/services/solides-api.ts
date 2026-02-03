/**
 * Sólides Tangerino API Client - READ-ONLY
 *
 * CRITICAL: This client ONLY reads data from the Sólides API.
 * It NEVER creates, updates, or deletes any data.
 * Only GET requests are allowed. Any other HTTP method is forbidden.
 */

import { env } from '../config/env';
import { logAudit } from '../models/queries';

const BASE_URL = env.SOLIDES_API_URL;
const TOKEN = env.SOLIDES_API_TOKEN;
const COMPANY_ID = env.SOLIDES_COMPANY_ID;

async function readOnlyFetch(endpoint: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(`${BASE_URL}${endpoint}`);
  if (params) {
    Object.entries(params).forEach(([key, value]) => url.searchParams.append(key, value));
  }

  logAudit('API_READ', 'solides', undefined, `GET ${endpoint}`);

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    throw new Error(`Sólides API error ${response.status}: ${errorText}`);
  }

  return response.json();
}

/** Fetch all employees from Sólides */
export async function fetchEmployees(): Promise<SolidesEmployee[]> {
  const data = await readOnlyFetch('/employees', { company_id: COMPANY_ID });
  return data?.employees || data || [];
}

/** Fetch clock punches for a specific date range */
export async function fetchClockPunches(
  startDate: string,
  endDate: string
): Promise<SolidesClockPunch[]> {
  const data = await readOnlyFetch('/clock-punches', {
    company_id: COMPANY_ID,
    start_date: startDate,
    end_date: endDate,
  });
  return data?.clock_punches || data || [];
}

/** Fetch clock punches for a specific employee */
export async function fetchEmployeeClockPunches(
  employeeId: string,
  startDate: string,
  endDate: string
): Promise<SolidesClockPunch[]> {
  const data = await readOnlyFetch(`/employees/${employeeId}/clock-punches`, {
    start_date: startDate,
    end_date: endDate,
  });
  return data?.clock_punches || data || [];
}

/** Fetch time bank / hours balance */
export async function fetchTimeBank(
  startDate: string,
  endDate: string
): Promise<SolidesTimeBank[]> {
  const data = await readOnlyFetch('/time-bank', {
    company_id: COMPANY_ID,
    start_date: startDate,
    end_date: endDate,
  });
  return data?.time_bank || data || [];
}

// ─── Types ─────────────────────────────────────────────────────

export interface SolidesEmployee {
  id: string;
  name: string;
  cpf?: string;
  department?: string;
  position?: string;
  admission_date?: string;
  status?: string;
}

export interface SolidesClockPunch {
  id?: string;
  employee_id: string;
  employee_name?: string;
  date: string;
  time: string;
  type?: string;
  punches?: Array<{ time: string; type?: string }>;
}

export interface SolidesTimeBank {
  employee_id: string;
  employee_name?: string;
  date: string;
  balance_minutes?: number;
  worked_minutes?: number;
  expected_minutes?: number;
}
