import { WORK_SCHEDULE, HourClassification, isSaturday, isWorkingDay, getExpectedMinutes } from '../config/constants';

export interface PunchSet {
  punch1: string | null; // Entry
  punch2: string | null; // Lunch out (or exit on Saturday)
  punch3: string | null; // Lunch return
  punch4: string | null; // Exit
}

export interface CalculationResult {
  totalWorkedMinutes: number;
  differenceMinutes: number;
  classification: HourClassification;
  isComplete: boolean;
}

export interface CalculationOptions {
  date?: string;           // Date in YYYY-MM-DD format (to check Saturday/holiday)
  isApprentice?: boolean;  // Apprentice has different hours
  expectedMinutes?: number; // Override expected minutes
}

/**
 * Parse a time string "HH:MM" or "HH:MM:SS" to minutes from midnight.
 */
function timeToMinutes(time: string): number {
  const parts = time.split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

/**
 * Calculate work hours from clock punches.
 *
 * Weekdays (Mon-Fri):
 *   Requires 4 punches
 *   Morning = punch2 - punch1
 *   Afternoon = punch4 - punch3
 *   Total = Morning + Afternoon
 *   Expected = 480 min (8h)
 *
 * Saturdays:
 *   Requires 2 punches (punch1 and punch2)
 *   Total = punch2 - punch1
 *   Expected = 240 min (4h)
 *
 * Classification:
 *   - |difference| <= 10 → normal
 *   - difference < -10 → late (worked less)
 *   - difference > 10 → overtime (worked more)
 */
export function calculateDailyHours(punches: PunchSet, options?: CalculationOptions): CalculationResult | null {
  const date = options?.date;
  const isApprentice = options?.isApprentice ?? false;

  // Check if it's a non-working day
  if (date && !isWorkingDay(date)) {
    return null; // No calculation for Sundays/holidays
  }

  // Determine if it's Saturday
  const isSat = date ? isSaturday(date) : false;

  // Get expected minutes
  let expectedMinutes: number;
  if (options?.expectedMinutes !== undefined) {
    expectedMinutes = options.expectedMinutes;
  } else if (date) {
    expectedMinutes = getExpectedMinutes(date, isApprentice);
  } else {
    expectedMinutes = WORK_SCHEDULE.EXPECTED_DAILY_MINUTES;
  }

  // Saturday or Apprentice: only need 2 punches (entry and exit)
  if (isSat || isApprentice) {
    if (!punches.punch1 || !punches.punch2) {
      return null;
    }

    const p1 = timeToMinutes(punches.punch1);
    const p2 = timeToMinutes(punches.punch2);

    const totalWorkedMinutes = p2 - p1;
    const differenceMinutes = totalWorkedMinutes - expectedMinutes;

    let classification: HourClassification;
    if (Math.abs(differenceMinutes) <= WORK_SCHEDULE.TOLERANCE_MINUTES) {
      classification = 'normal';
    } else if (differenceMinutes < 0) {
      classification = 'late';
    } else {
      classification = 'overtime';
    }

    return {
      totalWorkedMinutes,
      differenceMinutes,
      classification,
      isComplete: true,
    };
  }

  // Weekdays: need all 4 punches
  if (!punches.punch1 || !punches.punch2 || !punches.punch3 || !punches.punch4) {
    return null;
  }

  const p1 = timeToMinutes(punches.punch1);
  const p2 = timeToMinutes(punches.punch2);
  const p3 = timeToMinutes(punches.punch3);
  const p4 = timeToMinutes(punches.punch4);

  // Morning period: entry to lunch out
  const morningMinutes = p2 - p1;
  // Afternoon period: lunch return to exit
  const afternoonMinutes = p4 - p3;

  const totalWorkedMinutes = morningMinutes + afternoonMinutes;
  const differenceMinutes = totalWorkedMinutes - expectedMinutes;

  let classification: HourClassification;

  if (Math.abs(differenceMinutes) <= WORK_SCHEDULE.TOLERANCE_MINUTES) {
    classification = 'normal';
  } else if (differenceMinutes < 0) {
    classification = 'late';
  } else {
    classification = 'overtime';
  }

  return {
    totalWorkedMinutes,
    differenceMinutes,
    classification,
    isComplete: true,
  };
}

/**
 * Check if a record should trigger an alert.
 * Returns true if |difference| >= ALERT_THRESHOLD_MINUTES (11).
 */
export function shouldAlert(differenceMinutes: number): boolean {
  return Math.abs(differenceMinutes) >= WORK_SCHEDULE.ALERT_THRESHOLD_MINUTES;
}

/**
 * Format minutes to "Xh Ymin" display string.
 */
export function formatMinutes(minutes: number): string {
  const absMinutes = Math.abs(minutes);
  const hours = Math.floor(absMinutes / 60);
  const mins = absMinutes % 60;

  if (hours === 0) return `${mins}min`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}min`;
}

/**
 * Format classification for display.
 */
export function classificationLabel(classification: HourClassification): string {
  switch (classification) {
    case 'normal': return 'Normal';
    case 'late': return 'Atraso';
    case 'overtime': return 'Hora Extra';
  }
}
