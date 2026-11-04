import {
  getSaturdayMinutes, hasExtendedSaturday, isLojaSustentavelEmployee, isNoLunchEmployee,
  isBeforeAdmission, getExpectedMinutes,
} from '../../config/constants';
import { calculateDailyHoursForEmployee } from '../../services/hours-calculator';

const SATURDAY = '2026-10-31';
const WEDNESDAY = '2026-11-04';
const SUNDAY = '2026-11-01';

// In the legacy lists (constants.ts)
const DEISE = 'Deise Gislaine Silva vitor';          // EXTENDED_SATURDAY_EMPLOYEES
const EDUARDA = 'Eduarda Pereira Costa Silva';       // LOJA_SUSTENTAVEL_EMPLOYEES

describe('journey rules: registration field first, legacy name list as fallback', () => {
  it('Saturday minutes come from saturday_minutes when set', () => {
    expect(getSaturdayMinutes({ name: 'Nova Pessoa', saturday_minutes: 360 })).toBe(360);
    expect(getSaturdayMinutes({ name: 'Nova Pessoa', saturday_minutes: 240 })).toBe(240);
    // the field wins over the legacy list
    expect(getSaturdayMinutes({ name: DEISE, saturday_minutes: 240 })).toBe(240);
  });

  it('without the field, the legacy list still decides (same as before)', () => {
    expect(getSaturdayMinutes({ name: DEISE })).toBe(360);
    expect(getSaturdayMinutes(DEISE)).toBe(360);
    expect(getSaturdayMinutes({ name: 'Nova Pessoa' })).toBe(240);
    expect(getSaturdayMinutes({ name: DEISE, saturday_minutes: null })).toBe(360);
    expect(getSaturdayMinutes(null)).toBe(240);
  });

  it('extended Saturday follows the same resolution', () => {
    expect(hasExtendedSaturday({ name: 'Nova Pessoa', saturday_minutes: 360 })).toBe(true);
    expect(hasExtendedSaturday({ name: DEISE, saturday_minutes: 240 })).toBe(false);
    expect(hasExtendedSaturday({ name: DEISE })).toBe(true);
  });

  it('Loja Sustentável and no-lunch come from schedule_type when set', () => {
    expect(isLojaSustentavelEmployee({ name: 'Nova Pessoa', schedule_type: 'loja_sustentavel' })).toBe(true);
    expect(isLojaSustentavelEmployee({ name: EDUARDA, schedule_type: 'padrao' })).toBe(false);
    expect(isNoLunchEmployee({ name: 'Nova Pessoa', schedule_type: 'sem_almoco' })).toBe(true);
    expect(isNoLunchEmployee({ name: 'Nova Pessoa', schedule_type: 'loja_sustentavel' })).toBe(false);
  });

  it('missing or unknown schedule_type falls back to the legacy lists', () => {
    expect(isLojaSustentavelEmployee({ name: EDUARDA })).toBe(true);
    expect(isLojaSustentavelEmployee(EDUARDA)).toBe(true);
    expect(isLojaSustentavelEmployee({ name: EDUARDA, schedule_type: 'qualquer' })).toBe(true);
    expect(isLojaSustentavelEmployee({ name: 'Nova Pessoa' })).toBe(false);
    expect(isNoLunchEmployee({ name: 'Nova Pessoa' })).toBe(false);
  });

  it('getExpectedMinutes uses the employee on Saturdays', () => {
    expect(getExpectedMinutes(SATURDAY, false, 480, { name: 'Nova Pessoa', saturday_minutes: 360 })).toBe(360);
    expect(getExpectedMinutes(SATURDAY, false, 480, DEISE)).toBe(360);
    expect(getExpectedMinutes(WEDNESDAY, false, 480, { name: 'Nova Pessoa', saturday_minutes: 360 })).toBe(480);
  });
});

describe('admission date', () => {
  it('days before the admission are not working days for that person', () => {
    expect(isBeforeAdmission({ admission_date: '2026-11-05' }, WEDNESDAY)).toBe(true);
    expect(isBeforeAdmission({ admission_date: '2026-11-04' }, WEDNESDAY)).toBe(false);
    expect(isBeforeAdmission({ admission_date: '2026-10-27' }, WEDNESDAY)).toBe(false);
  });

  it('people without the field (or with a malformed one) are unaffected', () => {
    expect(isBeforeAdmission({}, WEDNESDAY)).toBe(false);
    expect(isBeforeAdmission({ admission_date: null }, WEDNESDAY)).toBe(false);
    expect(isBeforeAdmission({ admission_date: '05/11/2026' }, WEDNESDAY)).toBe(false);
    expect(isBeforeAdmission(undefined, WEDNESDAY)).toBe(false);
  });
});

describe('hours calculation with the registration fields', () => {
  const base = { is_apprentice: false, expected_daily_minutes: 480 };

  it('Saturday until 14:00 from saturday_minutes', () => {
    const r = calculateDailyHoursForEmployee({ punch1: '08:00', punch2: '14:00', punch3: null, punch4: null }, SATURDAY,
      { ...base, name: 'Nova Pessoa', saturday_minutes: 360 });
    expect(r).toMatchObject({ totalWorkedMinutes: 360, differenceMinutes: 0, classification: 'normal' });
  });

  it('the same Saturday is overtime for someone until 12:00', () => {
    const r = calculateDailyHoursForEmployee({ punch1: '08:00', punch2: '14:00', punch3: null, punch4: null }, SATURDAY,
      { ...base, name: 'Nova Pessoa', saturday_minutes: 240 });
    expect(r).toMatchObject({ differenceMinutes: 120, classification: 'overtime' });
  });

  it('Loja Sustentável from schedule_type: 12h with 2 punches, works on Sunday', () => {
    const emp = { ...base, name: 'Nova Pessoa', schedule_type: 'loja_sustentavel' };
    expect(calculateDailyHoursForEmployee({ punch1: '09:00', punch2: '21:00', punch3: null, punch4: null }, WEDNESDAY, emp))
      .toMatchObject({ totalWorkedMinutes: 720, classification: 'normal' });
    expect(calculateDailyHoursForEmployee({ punch1: '09:00', punch2: '20:00', punch3: null, punch4: null }, SUNDAY, emp))
      .toMatchObject({ totalWorkedMinutes: 660, classification: 'normal' });
  });

  it('no lunch from schedule_type: one pair is the whole weekday', () => {
    const r = calculateDailyHoursForEmployee({ punch1: '08:00', punch2: '16:00', punch3: null, punch4: null }, WEDNESDAY,
      { ...base, name: 'Nova Pessoa', schedule_type: 'sem_almoco' });
    expect(r).toMatchObject({ totalWorkedMinutes: 480, classification: 'normal' });
  });

  it('a standard employee still needs 4 punches on a weekday', () => {
    const r = calculateDailyHoursForEmployee({ punch1: '08:00', punch2: '16:00', punch3: null, punch4: null }, WEDNESDAY,
      { ...base, name: 'Nova Pessoa', schedule_type: 'padrao' });
    expect(r).toBeNull();
  });
});
