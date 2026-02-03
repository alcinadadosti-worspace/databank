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
  /** Expected daily work in minutes (8h) */
  EXPECTED_DAILY_MINUTES: 480,
  /** Number of expected clock punches per day */
  EXPECTED_PUNCHES: 4,
  /** Tolerance in minutes for late/overtime */
  TOLERANCE_MINUTES: 10,
  /** Threshold that triggers alert (tolerance + 1) */
  ALERT_THRESHOLD_MINUTES: 11,
} as const;

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
