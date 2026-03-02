/**
 * Holiday Sync Service
 * Fetches Brazilian public holidays from Nager.Date API
 * https://date.nager.at/
 */

import * as queries from '../models/queries';

interface NagerHoliday {
  date: string;          // YYYY-MM-DD
  localName: string;     // Name in local language (Portuguese)
  name: string;          // Name in English
  countryCode: string;   // BR
  fixed: boolean;        // Whether the date is fixed every year
  global: boolean;       // Whether it's a national holiday
  counties: string[] | null; // State codes (e.g., ["BR-SP"])
  launchYear: number | null;
  types: string[];       // ["Public", "Bank", "School", etc.]
}

interface SyncResult {
  year: number;
  fetched: number;
  created: number;
  skipped: number;
  errors: string[];
}

const NAGER_API_BASE = 'https://date.nager.at/api/v3';

/**
 * Fetch public holidays for Brazil from Nager.Date API
 */
export async function fetchBrazilianHolidays(year: number): Promise<NagerHoliday[]> {
  const url = `${NAGER_API_BASE}/publicholidays/${year}/BR`;

  console.log(`[holiday-sync] Fetching holidays for ${year} from ${url}`);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch holidays: ${response.status} ${response.statusText}`);
  }

  const holidays = await response.json() as NagerHoliday[];
  console.log(`[holiday-sync] Fetched ${holidays.length} holidays for ${year}`);

  return holidays;
}

/**
 * Map Nager holiday type to our holiday type
 */
function mapHolidayType(holiday: NagerHoliday): 'national' | 'state' | 'municipal' {
  if (holiday.global) {
    return 'national';
  }
  if (holiday.counties && holiday.counties.length > 0) {
    return 'state';
  }
  return 'national';
}

/**
 * Check if a holiday already exists in the database
 */
async function holidayExists(date: string, name: string): Promise<boolean> {
  const holidays = await queries.getAllHolidays();
  return holidays.some(h => h.date === date || (h.name === name && h.date.slice(5) === date.slice(5)));
}

/**
 * Sync holidays for a specific year
 */
export async function syncHolidaysForYear(year: number): Promise<SyncResult> {
  const result: SyncResult = {
    year,
    fetched: 0,
    created: 0,
    skipped: 0,
    errors: [],
  };

  try {
    const holidays = await fetchBrazilianHolidays(year);
    result.fetched = holidays.length;

    for (const holiday of holidays) {
      try {
        // Skip non-public holidays (like optional/observance)
        if (!holiday.types.includes('Public')) {
          result.skipped++;
          continue;
        }

        // Check if already exists
        const exists = await holidayExists(holiday.date, holiday.localName);
        if (exists) {
          console.log(`[holiday-sync] Skipping existing: ${holiday.localName} (${holiday.date})`);
          result.skipped++;
          continue;
        }

        // Insert new holiday
        const holidayType = mapHolidayType(holiday);
        await queries.insertHoliday(
          holiday.date,
          holiday.localName,
          holidayType,
          holiday.fixed // recurring if fixed date
        );

        console.log(`[holiday-sync] Created: ${holiday.localName} (${holiday.date}) [${holidayType}]`);
        result.created++;
      } catch (err) {
        const errorMsg = `Failed to insert ${holiday.localName}: ${err}`;
        console.error(`[holiday-sync] ${errorMsg}`);
        result.errors.push(errorMsg);
      }
    }

    await queries.logAudit('HOLIDAY_SYNC', 'system', undefined,
      `Synced ${year}: ${result.created} created, ${result.skipped} skipped`);

  } catch (err) {
    const errorMsg = `Failed to sync year ${year}: ${err}`;
    console.error(`[holiday-sync] ${errorMsg}`);
    result.errors.push(errorMsg);
  }

  return result;
}

/**
 * Sync holidays for current year and next year
 */
export async function syncUpcomingHolidays(): Promise<SyncResult[]> {
  const currentYear = new Date().getFullYear();
  const results: SyncResult[] = [];

  // Sync current year
  results.push(await syncHolidaysForYear(currentYear));

  // Sync next year
  results.push(await syncHolidaysForYear(currentYear + 1));

  return results;
}

/**
 * Get available years from Nager.Date API
 */
export async function getAvailableYears(): Promise<{ min: number; max: number }> {
  // Nager.Date typically supports current year +/- a few years
  const currentYear = new Date().getFullYear();
  return {
    min: currentYear - 1,
    max: currentYear + 2,
  };
}
