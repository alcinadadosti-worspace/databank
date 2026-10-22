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
