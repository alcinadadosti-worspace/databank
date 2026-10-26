import * as queries from '../../models/queries';
import * as bot from '../../slack/bot';
import { syncPunches } from '../../jobs/sync-punches';
import { runDailyChecks, sendWeeklyManagerAlerts } from '../../jobs/manager-daily-alert';

jest.mock('../../jobs/sync-punches', () => ({ syncPunches: jest.fn() }));
jest.mock('../../slack/bot', () => ({
  sendManagerWeeklySummary: jest.fn(),
  sendManagerDailySummary: jest.fn(),
  sendNoRecordNotification: jest.fn(),
  sendMissingPunchNotification: jest.fn(),
  sendLateStartNotification: jest.fn(),
  sendLatePunchNotification: jest.fn(),
}));
jest.mock('../../models/queries', () => ({
  isWorkingDayAsync: jest.fn(),
  getAllEmployees: jest.fn(),
  getDailyRecordsByDate: jest.fn(),
  getEmployeesOnVacation: jest.fn(),
  getEmployeesOnFolga: jest.fn(),
  getMedicalLeaveCoverage: jest.fn(),
  isWorkingDayForEmployee: jest.fn(),
  updateRecordClassification: jest.fn(),
  attachJustifications: jest.fn(),
  logAudit: jest.fn(),
}));

const q = queries as jest.Mocked<typeof queries>;
const b = bot as jest.Mocked<typeof bot>;
const syncMock = syncPunches as jest.MockedFunction<typeof syncPunches>;

beforeEach(() => {
  jest.resetAllMocks();
  q.isWorkingDayAsync.mockResolvedValue(true);
  q.getAllEmployees.mockResolvedValue([]);
  q.getDailyRecordsByDate.mockResolvedValue([]);
  q.getEmployeesOnVacation.mockResolvedValue(new Set());
  q.getEmployeesOnFolga.mockResolvedValue(new Map());
  q.getMedicalLeaveCoverage.mockResolvedValue(new Map());
  q.isWorkingDayForEmployee.mockResolvedValue(true);
  q.attachJustifications.mockImplementation(async (records: any) => records);
});

function expectSkipped() {
  expect(q.getAllEmployees).not.toHaveBeenCalled();
  expect(q.getDailyRecordsByDate).not.toHaveBeenCalled();
  expect(q.logAudit).toHaveBeenCalledWith('CHECK_SKIPPED_STALE_DATA', 'system', undefined, expect.any(String));
}

it('the daily check sends nothing when the Sólides sync fails', async () => {
  syncMock.mockRejectedValue(new Error('Sólides API error 500 on /'));

  await runDailyChecks();

  expectSkipped();
  expect(b.sendMissingPunchNotification).not.toHaveBeenCalled();
  expect(b.sendNoRecordNotification).not.toHaveBeenCalled();
  expect(b.sendManagerDailySummary).not.toHaveBeenCalled();
});

it('the daily check sends nothing when Sólides returns no punches for a working day', async () => {
  syncMock.mockResolvedValue(0);

  await runDailyChecks();

  expectSkipped();
});

it('the daily check runs on fresh data, re-synced silently first', async () => {
  syncMock.mockResolvedValue(120);

  await runDailyChecks();

  expect(syncMock).toHaveBeenCalledWith(expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), { skipNotifications: true });
  expect(q.getAllEmployees).toHaveBeenCalled();
  expect(q.logAudit).not.toHaveBeenCalledWith('CHECK_SKIPPED_STALE_DATA', expect.anything(), expect.anything(), expect.anything());
});

it('the weekly summary is skipped when any day of the week fails to sync', async () => {
  syncMock.mockResolvedValueOnce(120).mockRejectedValueOnce(new Error('Sólides API error 500 on /'));

  await sendWeeklyManagerAlerts();

  expectSkipped();
  expect(b.sendManagerWeeklySummary).not.toHaveBeenCalled();
});

it('a day with no punches (e.g. unregistered holiday) does not cancel the weekly summary', async () => {
  syncMock.mockResolvedValueOnce(0).mockResolvedValue(120);
  q.getDailyRecordsByDate.mockResolvedValue([
    { id: 1, employee_id: 1, date: '2026-10-20', classification: 'late', difference_minutes: -30, leader_id: 5, leader_slack_id: 'U1', leader_name: 'Gestor' },
  ] as any);

  await sendWeeklyManagerAlerts();

  expect(q.logAudit).not.toHaveBeenCalledWith('CHECK_SKIPPED_STALE_DATA', expect.anything(), expect.anything(), expect.anything());
  expect(b.sendManagerWeeklySummary).toHaveBeenCalled();
});

describe('08:00 check with RH atestados', () => {
  // Thursday 10/15 morning: the check looks at Wednesday 10/14 (a weekday, 4 punches expected)
  beforeEach(() => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate'] });
    jest.setSystemTime(new Date('2026-10-15T15:00:00Z'));
    syncMock.mockResolvedValue(120);
    q.getAllEmployees.mockResolvedValue([{ id: 1, name: 'Ana', slack_id: 'U1', leader_id: 5 }] as any);
  });
  afterEach(() => jest.useRealTimers());

  const morningOnly = (classification: string | null) => [
    { id: 5, employee_id: 1, date: '2026-10-14', punch_1: '08:00', punch_2: '12:00', punch_3: null, punch_4: null, classification },
  ] as any;

  it('without an atestado, a morning-only day still asks the employee for the missing punches', async () => {
    q.getDailyRecordsByDate.mockResolvedValue(morningOnly(null));
    await runDailyChecks();
    expect(b.sendMissingPunchNotification).toHaveBeenCalled();
  });

  it('a 4h atestado day already computed by the sync gets no "ajuste" DM', async () => {
    q.getDailyRecordsByDate.mockResolvedValue(morningOnly('normal'));
    q.getMedicalLeaveCoverage.mockResolvedValue(new Map([[1, { fullDay: false, hoursOff: 4 }]]));
    await runDailyChecks();
    expect(b.sendMissingPunchNotification).not.toHaveBeenCalled();
    expect(b.sendLateStartNotification).not.toHaveBeenCalled();
    expect(q.updateRecordClassification).not.toHaveBeenCalled();
  });

  it('a whole-day atestado without punches does not ask the gestor about the absence', async () => {
    q.getDailyRecordsByDate.mockResolvedValue([]);
    q.getMedicalLeaveCoverage.mockResolvedValue(new Map([[1, { fullDay: true, hoursOff: 0 }]]));
    await runDailyChecks();
    expect(b.sendNoRecordNotification).not.toHaveBeenCalled();
  });
});
