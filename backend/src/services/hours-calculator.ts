import { WORK_SCHEDULE, HourClassification } from '../config/constants';

export interface PunchSet {
  punch1: string | null; // Entry
  punch2: string | null; // Lunch out
  punch3: string | null; // Lunch return
  punch4: string | null; // Exit
}

export interface CalculationResult {
  totalWorkedMinutes: number;
  differenceMinutes: number;
  classification: HourClassification;
  isComplete: boolean;
}

/**
 * Parse a time string "HH:MM" or "HH:MM:SS" to minutes from midnight.
 */
function timeToMinutes(time: string): number {
  const parts = time.split(':');
  return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
}

/**
 * Calculate work hours from 4 clock punches.
 *
 * Calculation:
 *   Morning = punch2 - punch1
 *   Afternoon = punch4 - punch3
 *   Total = Morning + Afternoon
 *   Difference = Total - Expected (480 min)
 *
 * Classification:
 *   - |difference| <= 10 → normal
 *   - difference <= -11 → late (negative hours)
 *   - difference >= 11 → overtime
 */
export function calculateDailyHours(punches: PunchSet): CalculationResult | null {
  // Only calculate when all 4 punches exist
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
  const differenceMinutes = totalWorkedMinutes - WORK_SCHEDULE.EXPECTED_DAILY_MINUTES;

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
