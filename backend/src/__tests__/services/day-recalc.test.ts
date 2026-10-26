import * as queries from '../../models/queries';
import { recalculateDay, refreshStoredDays } from '../../services/day-recalc';
import { calculateDailyHoursForEmployee } from '../../services/hours-calculator';

jest.mock('../../models/queries', () => ({
  isWorkingDayAsync: jest.fn(),
  getEmployeesOnVacation: jest.fn(),
  getEmployeesOnFolga: jest.fn(),
  getMedicalLeaveCoverage: jest.fn(),
  getEmployeeRecordsInRange: jest.fn(),
  getEmployeeById: jest.fn(),
  updateDailyRecordPunches: jest.fn(),
}));

const q = queries as jest.Mocked<typeof queries>;
const EMP = { id: 7, name: 'Fulana de Tal' };
const WEEKDAY = '2026-10-14'; // a plain Wednesday (10/12 is a national holiday)
const FULL_DAY = { punch1: '08:00', punch2: '12:00', punch3: '14:00', punch4: '18:00' };
const HALF_DAY = { punch1: '08:00', punch2: '12:00', punch3: null, punch4: null };

function folga(type: 'integral' | 'partial', hours_off: number) {
  return new Map([[EMP.id, { id: 1, employee_id: EMP.id, leader_id: 1, date: WEEKDAY, type, hours_off, notes: null, created_at: '', created_by: null }]]);
}

beforeEach(() => {
  jest.resetAllMocks();
  q.isWorkingDayAsync.mockResolvedValue(true);
  q.getEmployeesOnVacation.mockResolvedValue(new Set());
  q.getEmployeesOnFolga.mockResolvedValue(new Map());
  q.getMedicalLeaveCoverage.mockResolvedValue(new Map());
  q.getEmployeeById.mockResolvedValue(EMP as any);
});

function atestado(fullDay: boolean, hoursOff = 0) {
  return new Map([[EMP.id, { fullDay, hoursOff }]]);
}

describe('calculateDailyHoursForEmployee minutesOff', () => {
  it('subtracts a partial folga from the weekday expected minutes', () => {
    // 4h folga + 4h worked = normal (was "Atraso 4h" before)
    const punches = { punch1: '08:00', punch2: '10:00', punch3: '14:00', punch4: '16:00' };
    expect(calculateDailyHoursForEmployee(punches, WEEKDAY, EMP)?.classification).toBe('late');
    const withFolga = calculateDailyHoursForEmployee(punches, WEEKDAY, EMP, { minutesOff: 240 });
    expect(withFolga?.differenceMinutes).toBe(0);
    expect(withFolga?.classification).toBe('normal');
  });

  it('on a shortened weekday a single period is complete only when it covers the shorter journey', () => {
    const morning = { punch1: '08:00', punch2: '12:00', punch3: null, punch4: null };
    expect(calculateDailyHoursForEmployee(morning, WEEKDAY, EMP)).toBeNull();
    expect(calculateDailyHoursForEmployee(morning, WEEKDAY, EMP, { minutesOff: 240 })?.classification).toBe('normal');
    expect(calculateDailyHoursForEmployee(morning, WEEKDAY, EMP, { minutesOff: 60 })).toBeNull();
  });

  it('subtracts a partial folga on Saturday too', () => {
    const r = calculateDailyHoursForEmployee({ punch1: '08:00', punch2: '10:00', punch3: null, punch4: null }, '2026-10-10', EMP, { minutesOff: 120 });
    expect(r?.differenceMinutes).toBe(0);
  });
});

describe('recalculateDay', () => {
  it('returns no classification on a holiday registered in the panel', async () => {
    q.isWorkingDayAsync.mockResolvedValue(false);
    expect(await recalculateDay(FULL_DAY, WEEKDAY, EMP)).toEqual({ totalWorkedMinutes: null, differenceMinutes: null, classification: null });
  });

  it('marks vacation days as ferias', async () => {
    q.getEmployeesOnVacation.mockResolvedValue(new Set([EMP.id]));
    expect((await recalculateDay(FULL_DAY, WEEKDAY, EMP)).classification).toBe('ferias');
  });

  it('marks integral folga as folga', async () => {
    q.getEmployeesOnFolga.mockResolvedValue(folga('integral', 8));
    expect((await recalculateDay(HALF_DAY, WEEKDAY, EMP)).classification).toBe('folga');
  });

  it('applies partial folga hours', async () => {
    q.getEmployeesOnFolga.mockResolvedValue(folga('partial', 4));
    const r = await recalculateDay({ punch1: '08:00', punch2: '10:00', punch3: '14:00', punch4: '16:00' }, WEEKDAY, EMP);
    expect(r).toEqual({ totalWorkedMinutes: 240, differenceMinutes: 0, classification: 'normal' });
  });

  it('computes a regular day normally', async () => {
    expect(await recalculateDay(FULL_DAY, WEEKDAY, EMP)).toEqual({ totalWorkedMinutes: 480, differenceMinutes: 0, classification: 'normal' });
  });

  it('marks a day covered by an RH atestado in days as atestado_medico', async () => {
    q.getMedicalLeaveCoverage.mockResolvedValue(atestado(true));
    expect(await recalculateDay(HALF_DAY, WEEKDAY, EMP)).toEqual({ totalWorkedMinutes: null, differenceMinutes: null, classification: 'atestado_medico' });
  });

  it('takes RH atestado hours off the expected minutes, on top of a partial folga', async () => {
    q.getEmployeesOnFolga.mockResolvedValue(folga('partial', 2));
    q.getMedicalLeaveCoverage.mockResolvedValue(atestado(false, 2));
    const r = await recalculateDay({ punch1: '08:00', punch2: '10:00', punch3: '14:00', punch4: '16:00' }, WEEKDAY, EMP);
    expect(r).toEqual({ totalWorkedMinutes: 240, differenceMinutes: 0, classification: 'normal' });
  });

  it('vacation wins over an RH atestado', async () => {
    q.getEmployeesOnVacation.mockResolvedValue(new Set([EMP.id]));
    q.getMedicalLeaveCoverage.mockResolvedValue(atestado(true));
    expect((await recalculateDay(FULL_DAY, WEEKDAY, EMP)).classification).toBe('ferias');
  });
});

describe('refreshStoredDays', () => {
  const record = (over: Partial<queries.DailyRecord>) => ({
    id: 99, employee_id: EMP.id, date: WEEKDAY,
    punch_1: null, punch_2: null, punch_3: null, punch_4: null,
    total_worked_minutes: null, difference_minutes: null, classification: null,
    alert_sent: 0, manager_alert_sent: 0, created_at: '', updated_at: '',
    ...over,
  });

  it('turns a past "Atraso" into Folga when an integral folga is registered', async () => {
    q.getEmployeeRecordsInRange.mockResolvedValue([record({ ...{ punch_1: '08:00', punch_2: '12:00' }, classification: 'late', difference_minutes: -240, total_worked_minutes: 240 })] as any);
    q.getEmployeesOnFolga.mockResolvedValue(folga('integral', 8));
    expect(await refreshStoredDays(EMP.id, WEEKDAY, WEEKDAY)).toBe(1);
    expect(q.updateDailyRecordPunches).toHaveBeenCalledWith(99, '08:00', '12:00', null, null, null, null, 'folga');
  });

  it('turns "Atraso 4h" into Normal when a 4h partial folga is registered', async () => {
    q.getEmployeeRecordsInRange.mockResolvedValue([record({ punch_1: '08:00', punch_2: '10:00', punch_3: '14:00', punch_4: '16:00', classification: 'late', total_worked_minutes: 240, difference_minutes: -240 })] as any);
    q.getEmployeesOnFolga.mockResolvedValue(folga('partial', 4));
    await refreshStoredDays(EMP.id, WEEKDAY, WEEKDAY);
    expect(q.updateDailyRecordPunches).toHaveBeenCalledWith(99, '08:00', '10:00', '14:00', '16:00', 240, 0, 'normal');
  });

  it('when a folga is removed from a day without punches, goes back to sem_registro', async () => {
    q.getEmployeeRecordsInRange.mockResolvedValue([record({ classification: 'folga' })] as any);
    await refreshStoredDays(EMP.id, WEEKDAY, WEEKDAY);
    expect(q.updateDailyRecordPunches).toHaveBeenCalledWith(99, null, null, null, null, null, null, 'sem_registro');
  });

  it('a folga removed for TODAY leaves the day open instead of locking it as ajuste', async () => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    q.getEmployeeRecordsInRange.mockResolvedValue([record({ date: today, punch_1: '08:00', classification: 'folga' })] as any);
    await refreshStoredDays(EMP.id, today, today);
    expect(q.updateDailyRecordPunches).toHaveBeenCalledWith(99, '08:00', null, null, null, null, null, null);
  });

  it('still works for an employee no longer registered (dismissed)', async () => {
    q.getEmployeeById.mockResolvedValue(undefined);
    q.getEmployeeRecordsInRange.mockResolvedValue([record({ punch_1: '08:00', punch_2: '12:00', punch_3: '14:00', punch_4: '18:00', classification: 'folga' })] as any);
    await refreshStoredDays(EMP.id, WEEKDAY, WEEKDAY);
    expect(q.updateDailyRecordPunches).toHaveBeenCalledWith(99, '08:00', '12:00', '14:00', '18:00', 480, 0, 'normal');
  });

  it("keeps the gestor's Slack decision (falta) when nothing new applies", async () => {
    q.getEmployeeRecordsInRange.mockResolvedValue([record({ classification: 'falta' })] as any);
    expect(await refreshStoredDays(EMP.id, WEEKDAY, WEEKDAY)).toBe(0);
    expect(q.updateDailyRecordPunches).not.toHaveBeenCalled();
  });

  it("an RH atestado in days replaces the gestor's falta and a past Sem registro", async () => {
    q.getEmployeeRecordsInRange.mockResolvedValue([
      record({ classification: 'falta' }),
      record({ id: 100, date: '2026-10-15', classification: 'sem_registro' }),
    ] as any);
    q.getMedicalLeaveCoverage.mockResolvedValue(atestado(true));
    expect(await refreshStoredDays(EMP.id, WEEKDAY, '2026-10-15')).toBe(2);
    expect(q.updateDailyRecordPunches).toHaveBeenCalledWith(99, null, null, null, null, null, null, 'atestado_medico');
    expect(q.updateDailyRecordPunches).toHaveBeenCalledWith(100, null, null, null, null, null, null, 'atestado_medico');
  });

  it('deleting an RH atestado reopens the day; without releaseAtestado a Slack atestado stays', async () => {
    q.getEmployeeRecordsInRange.mockResolvedValue([record({ classification: 'atestado_medico' })] as any);
    expect(await refreshStoredDays(EMP.id, WEEKDAY, WEEKDAY)).toBe(0);
    await refreshStoredDays(EMP.id, WEEKDAY, WEEKDAY, { releaseAtestado: true });
    expect(q.updateDailyRecordPunches).toHaveBeenCalledWith(99, null, null, null, null, null, null, 'sem_registro');
  });

  it('does not rewrite records that are already right', async () => {
    q.getEmployeeRecordsInRange.mockResolvedValue([record({ punch_1: '08:00', punch_2: '12:00', punch_3: '14:00', punch_4: '18:00', classification: 'normal', total_worked_minutes: 480, difference_minutes: 0 })] as any);
    expect(await refreshStoredDays(EMP.id, WEEKDAY, WEEKDAY)).toBe(0);
  });
});
