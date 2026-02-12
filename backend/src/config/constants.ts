/** Work schedule constants */
export const WORK_SCHEDULE = {
  /** Expected start time */
  ENTRY_TIME: '08:00',
  /** Lunch break start */
  LUNCH_START: '12:00',
  /** Lunch break end */
  LUNCH_END: '14:00',
  /** Expected end time */
  EXIT_TIME: '18:00',
  /** Lunch duration in minutes */
  LUNCH_DURATION_MINUTES: 120,
  /** Expected daily work in minutes (8h) - Monday to Friday */
  EXPECTED_DAILY_MINUTES: 480,
  /** Expected Saturday work in minutes (4h) - 08:00 to 12:00 */
  EXPECTED_SATURDAY_MINUTES: 240,
  /** Number of expected clock punches per day (weekdays) */
  EXPECTED_PUNCHES: 4,
  /** Number of expected clock punches on Saturday */
  EXPECTED_SATURDAY_PUNCHES: 2,
  /** Tolerance in minutes for late/overtime */
  TOLERANCE_MINUTES: 10,
  /** Threshold that triggers alert (tolerance + 1) */
  ALERT_THRESHOLD_MINUTES: 11,
} as const;

/**
 * Brazilian national holidays (fixed dates)
 * Format: MM-DD
 */
export const FIXED_HOLIDAYS = [
  '01-01', // Confraternizacao Universal
  '04-21', // Tiradentes
  '05-01', // Dia do Trabalho
  '09-07', // Independencia do Brasil
  '10-12', // Nossa Senhora Aparecida
  '11-02', // Finados
  '11-15', // Proclamacao da Republica
  '12-25', // Natal
] as const;

/**
 * Brazilian mobile holidays (varies by year)
 * These need to be calculated or manually updated each year
 * Format: YYYY-MM-DD
 */
export const MOBILE_HOLIDAYS: Record<number, string[]> = {
  2025: [
    '2025-03-03', // Carnaval (segunda)
    '2025-03-04', // Carnaval (terca)
    '2025-04-18', // Sexta-feira Santa
    '2025-06-19', // Corpus Christi
  ],
  2026: [
    '2026-02-16', // Carnaval (segunda)
    '2026-02-17', // Carnaval (terca)
    '2026-04-03', // Sexta-feira Santa
    '2026-06-04', // Corpus Christi
  ],
  2027: [
    '2027-02-08', // Carnaval (segunda)
    '2027-02-09', // Carnaval (terca)
    '2027-03-26', // Sexta-feira Santa
    '2027-05-27', // Corpus Christi
  ],
};

/**
 * Check if a date is a Brazilian national holiday (static list only)
 * For dynamic holidays from database, use isHolidayAsync from queries.ts
 */
export function isHoliday(dateStr: string): boolean {
  const date = new Date(dateStr + 'T12:00:00Z');
  const year = date.getUTCFullYear();
  const monthDay = dateStr.slice(5); // MM-DD

  // Check fixed holidays
  if (FIXED_HOLIDAYS.includes(monthDay as any)) {
    return true;
  }

  // Check mobile holidays for the year
  const mobileHolidays = MOBILE_HOLIDAYS[year] || [];
  if (mobileHolidays.includes(dateStr)) {
    return true;
  }

  return false;
}

/**
 * Check if a date is a working day (not Sunday, not holiday)
 * Uses static holiday list only. For dynamic check, use isWorkingDayAsync
 */
export function isWorkingDay(dateStr: string): boolean {
  const date = new Date(dateStr + 'T12:00:00Z');
  const dayOfWeek = date.getUTCDay(); // 0 = Sunday, 6 = Saturday

  // Sunday - not a working day
  if (dayOfWeek === 0) {
    return false;
  }

  // Check if it's a holiday (static list)
  if (isHoliday(dateStr)) {
    return false;
  }

  return true;
}

// Dynamic holiday check functions will be called from queries.ts
// which has access to the database

/**
 * Check if a date is Saturday
 */
export function isSaturday(dateStr: string): boolean {
  const date = new Date(dateStr + 'T12:00:00Z');
  return date.getUTCDay() === 6;
}

/**
 * Get expected work minutes for a given date
 * Returns 0 for non-working days, 240 for Saturday, 480 for weekdays
 */
export function getExpectedMinutes(dateStr: string, isApprentice: boolean = false, apprenticeMinutes: number = 240): number {
  if (!isWorkingDay(dateStr)) {
    return 0;
  }

  if (isSaturday(dateStr)) {
    // Apprentices may have different Saturday hours
    return isApprentice ? Math.min(apprenticeMinutes, WORK_SCHEDULE.EXPECTED_SATURDAY_MINUTES) : WORK_SCHEDULE.EXPECTED_SATURDAY_MINUTES;
  }

  return isApprentice ? apprenticeMinutes : WORK_SCHEDULE.EXPECTED_DAILY_MINUTES;
}

/** Justification options for lateness */
export const LATE_JUSTIFICATIONS = [
  'Atestado médico',
  'Ajuste de horas',
  'Compensação de horas',
  'Esquecimento',
  'Máquina de ponto indisponível',
] as const;

/** Justification options for overtime */
export const OVERTIME_JUSTIFICATIONS = [
  'Estava em reunião',
  'Inventário',
  'Troca de vitrine',
  'Ação de vendas',
  'Gestor ordenou sair mais tarde',
] as const;

export type LateJustification = typeof LATE_JUSTIFICATIONS[number];
export type OvertimeJustification = typeof OVERTIME_JUSTIFICATIONS[number];
export type Justification = LateJustification | OvertimeJustification;

/** Hour classification */
export type HourClassification = 'normal' | 'late' | 'overtime';
