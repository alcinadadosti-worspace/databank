import * as queries from '../../models/queries';
import { fetchPunches } from '../../services/solides-api';
import { syncPunches } from '../../jobs/sync-punches';

jest.mock('../../services/solides-api', () => ({ fetchPunches: jest.fn() }));
jest.mock('../../slack/bot', () => ({ sendEmployeeAlert: jest.fn() }));
jest.mock('../../models/queries', () => ({
  getEmployeesOnFolga: jest.fn(),
  getMedicalLeaveCoverage: jest.fn(),
  getDailyRecordsByDate: jest.fn(),
  getAllEmployees: jest.fn(),
  updateEmployeeSolidesId: jest.fn(),
  isWorkingDayAsync: jest.fn(),
  upsertDailyRecord: jest.fn(),
  getDailyRecord: jest.fn(),
  markAlertSent: jest.fn(),
  logAudit: jest.fn(),
}));

const q = queries as jest.Mocked<typeof queries>;
const fetchMock = fetchPunches as jest.MockedFunction<typeof fetchPunches>;
const DATE = '2026-10-13'; // Tuesday

// 08:00–12:00 and 13:00–17:00 BRT as epoch millis (UTC+3h)
const at = (hhmm: string) => Date.parse(`${DATE}T${hhmm}:00Z`) + 3 * 3600 * 1000;
function fullDay(solidesId: string) {
  return [
    { id: `${solidesId}a`, employeeId: solidesId, employeeName: '', date: DATE, dateIn: at('08:00'), dateOut: at('12:00'), type: 0, status: 'APPROVED' },
    { id: `${solidesId}b`, employeeId: solidesId, employeeName: '', date: DATE, dateIn: at('13:00'), dateOut: at('16:00'), type: 0, status: 'APPROVED' },
  ];
}

beforeEach(() => {
  jest.resetAllMocks();
  q.getEmployeesOnFolga.mockResolvedValue(new Map());
  q.getMedicalLeaveCoverage.mockResolvedValue(new Map());
  q.isWorkingDayAsync.mockResolvedValue(true);
  q.getAllEmployees.mockResolvedValue([
    { id: 1, name: 'Ana', solides_employee_id: 's1' },
    { id: 2, name: 'Bia', solides_employee_id: 's2' },
  ] as any);
});

it('a gestor sync only touches their own team', async () => {
  fetchMock.mockResolvedValue([...fullDay('s1'), ...fullDay('s2')]);
  q.getDailyRecordsByDate.mockResolvedValue([]);

  await syncPunches(DATE, { skipNotifications: true, employeeIds: new Set([2]) });

  expect(q.upsertDailyRecord).toHaveBeenCalledTimes(1);
  expect(q.upsertDailyRecord.mock.calls[0][0]).toBe(2);
});

it("a re-sync with the same punches keeps the gestor's decision instead of recomputing Atraso", async () => {
  fetchMock.mockResolvedValue(fullDay('s1')); // 7h worked → would be "late"
  q.getDailyRecordsByDate.mockResolvedValue([
    { id: 10, employee_id: 1, date: DATE, punch_1: '08:00', punch_2: '12:00', punch_3: '13:00', punch_4: '16:00', classification: 'ajuste', total_worked_minutes: null, difference_minutes: null, alert_sent: 0 },
  ] as any);

  await syncPunches(DATE, { skipNotifications: true });

  const call = q.upsertDailyRecord.mock.calls[0];
  expect(call[0]).toBe(1);
  expect(call[8]).toBeNull(); // classification null = keep stored 'ajuste'
});

it('new punches from Sólides (e.g. RH fixed the missing one) are recalculated even over a decision', async () => {
  fetchMock.mockResolvedValue(fullDay('s1'));
  q.getDailyRecordsByDate.mockResolvedValue([
    { id: 10, employee_id: 1, date: DATE, punch_1: '08:00', punch_2: null, punch_3: null, punch_4: null, classification: 'ajuste', total_worked_minutes: null, difference_minutes: null, alert_sent: 0 },
  ] as any);

  await syncPunches(DATE, { skipNotifications: true });

  expect(q.upsertDailyRecord.mock.calls[0][8]).toBe('late');
});

it('without a decision the computed classification is written', async () => {
  fetchMock.mockResolvedValue(fullDay('s1'));
  q.getDailyRecordsByDate.mockResolvedValue([]);

  await syncPunches(DATE, { skipNotifications: true });

  expect(q.upsertDailyRecord.mock.calls[0][8]).toBe('late');
});

it('after 21:00 BRT the automatic sync still fetches TODAY (São Paulo), not tomorrow (UTC)', async () => {
  jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
  jest.setSystemTime(new Date('2026-10-16T00:30:00Z')); // 21:30 BRT on 10/15
  try {
    fetchMock.mockResolvedValue([]);
    await syncPunches(undefined, { skipNotifications: true });
    expect(fetchMock).toHaveBeenCalledWith('2026-10-15', '2026-10-15');
  } finally {
    jest.useRealTimers();
  }
});

it('reports a Sólides failure instead of finishing as success', async () => {
  fetchMock.mockRejectedValue(new Error('Sólides API error 503'));
  await expect(syncPunches(DATE, { skipNotifications: true })).rejects.toThrow('503');
  expect(q.logAudit).toHaveBeenCalledWith('SYNC_ERROR', 'system', undefined, expect.stringContaining('503'));
});

it('a whole-day RH atestado saves the punches as atestado_medico and never alerts', async () => {
  fetchMock.mockResolvedValue(fullDay('s1')); // 7h worked → would be "late"
  q.getDailyRecordsByDate.mockResolvedValue([]);
  q.getMedicalLeaveCoverage.mockResolvedValue(new Map([[1, { fullDay: true, hoursOff: 0 }]]));

  await syncPunches(DATE); // notifications on: the alert path must not even be reached

  const call = q.upsertDailyRecord.mock.calls[0];
  expect(call[0]).toBe(1);
  expect(call[8]).toBe('atestado_medico');
  expect(q.getDailyRecord).not.toHaveBeenCalled();
});

it('RH atestado hours come off the expected day (7h worked + 1h atestado = normal)', async () => {
  fetchMock.mockResolvedValue(fullDay('s1'));
  q.getDailyRecordsByDate.mockResolvedValue([]);
  q.getMedicalLeaveCoverage.mockResolvedValue(new Map([[1, { fullDay: false, hoursOff: 1 }]]));

  await syncPunches(DATE, { skipNotifications: true });

  expect(q.upsertDailyRecord.mock.calls[0].slice(6)).toEqual([420, 0, 'normal']);
});

it('a 4h atestado: the morning alone is the whole day (normal); with 1h off it waits for the afternoon', async () => {
  const morning = [{ id: 's1a', employeeId: 's1', employeeName: '', date: DATE, dateIn: at('08:00'), dateOut: at('12:00'), type: 0, status: 'APPROVED' }];
  fetchMock.mockResolvedValue(morning);
  q.getDailyRecordsByDate.mockResolvedValue([]);

  q.getMedicalLeaveCoverage.mockResolvedValue(new Map([[1, { fullDay: false, hoursOff: 4 }]]));
  await syncPunches(DATE, { skipNotifications: true });
  expect(q.upsertDailyRecord.mock.calls[0].slice(6)).toEqual([240, 0, 'normal']);

  q.upsertDailyRecord.mockClear();
  q.getMedicalLeaveCoverage.mockResolvedValue(new Map([[1, { fullDay: false, hoursOff: 1 }]]));
  await syncPunches(DATE, { skipNotifications: true });
  expect(q.upsertDailyRecord.mock.calls[0].slice(6)).toEqual([null, null, null]); // not "Atraso" at lunch time
});
