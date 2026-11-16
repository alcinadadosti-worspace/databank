import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import * as queries from '../../models/queries';
import * as solides from '../../services/solides-api';
import * as bot from '../../slack/bot';
import { clearSolidesRosterCache, clearSlackDirectoryCache } from '../../services/employee-admin';
import { authAdmin, generateToken } from '../../middleware/auth';
import router from '../../routes/admin';

jest.mock('../../models/queries', () => ({
  getAllEmployees: jest.fn(),
  getAllLeaders: jest.fn(),
  getEmployeeById: jest.fn(),
  getEmployeeFresh: jest.fn(),
  transferEmployee: jest.fn(),
  insertEmployeeFromPanel: jest.fn(),
  getEmployeeRemovalSummary: jest.fn(),
  removeEmployeeKeepingHistory: jest.fn(),
  deleteEmployee: jest.fn(),
  logAudit: jest.fn(),
  unitChoicesForLeader: jest.fn(),
  resolveUnitName: jest.fn(),
  UNIT_OPTIONS_BY_LEADER: { 11: ['Loja Coruripe', 'Loja Teotonio Vilela'] },
  HIDDEN_LEADER_IDS: [14, 16],
}));
// Sólides: only the read-only roster is used; nothing may write there
jest.mock('../../services/solides-api', () => ({ fetchEmployeeRoster: jest.fn() }));
// Every Slack sender is a mock: the tests assert none of them is called
jest.mock('../../slack/bot', () => ({
  sendEmployeeAlert: jest.fn(),
  sendManagerDailySummary: jest.fn(),
  getSlackApp: jest.fn(() => null),
}));
jest.mock('../../jobs/sync-punches', () => ({ syncPunches: jest.fn() }));
jest.mock('../../services/day-recalc', () => ({ recalculateDay: jest.fn() }));
jest.mock('../../config/env', () => ({ env: { ...jest.requireActual('../../config/env').env, SLACK_BOT_TOKEN: 'xoxb-test' } }));

const q = queries as jest.Mocked<typeof queries>;
const s = solides as jest.Mocked<typeof solides>;
const b = bot as jest.Mocked<typeof bot>;

const rhToken = generateToken({ id: 0, name: 'Administrador RH', role: 'admin' });
const gestorToken = generateToken({ id: 7, name: 'Erick', role: 'manager', email: 'erick@x.com' });

const VITORIA = { id: '7187482', name: 'Vitoria Regina Lúcio da Silva', email: 'vitoria@x.com', admissionDate: '2026-10-27', fired: false, recordsPunch: true };
const JOSENILDO = { id: '6349128', name: 'Josenildo Alves da silva Júnior', email: null, admissionDate: '2026-04-14', fired: true, recordsPunch: true };
const ANNY = { id: 64, name: 'Anny Karoline Andrade Santos', slack_id: 'U08JFCGBFSA', leader_id: 12, leader_name: 'Mariane', secondary_approver_id: null, solides_employee_id: '4798744', no_punch_required: false };
const TEAM_11 = [
  { id: 62, name: 'Bruna Rayane', slack_id: 'U1', leader_id: 11, secondary_approver_id: 10, solides_employee_id: '1' },
  { id: 63, name: 'Ana Paula', slack_id: 'U2', leader_id: 11, secondary_approver_id: 10, solides_employee_id: '2' },
];
const LEADERS = [
  { id: 10, name: 'Kemilly Rafaelly Souza Silva', sector: 'Canal Loja' },
  { id: 11, name: 'Maria Taciane Pereira Barbosa', sector: 'Canal Loja' },
  { id: 12, name: 'Mariane Santos Sousa', sector: 'Canal Loja' },
  { id: 14, name: 'Rafaela Alves Mendes', sector: 'Alta Lideranca' }, // dismissed, hidden
];

const realFetch = global.fetch;
const outboundCalls: string[] = [];
let server: Server;
let baseUrl: string;

beforeAll(done => {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', authAdmin, router);
  server = app.listen(0, () => {
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    done();
  });
});

afterAll(done => { server.close(done); });

beforeEach(() => {
  jest.resetAllMocks();
  clearSolidesRosterCache();
  clearSlackDirectoryCache();
  outboundCalls.length = 0;
  q.getAllEmployees.mockResolvedValue([ANNY, ...TEAM_11] as any);
  q.getAllLeaders.mockResolvedValue(LEADERS as any);
  q.getEmployeeById.mockImplementation(async id => [ANNY, ...TEAM_11].find(e => e.id === id) as any);
  q.unitChoicesForLeader.mockImplementation((id: number) => id === 11
    ? { required: true, options: ['Loja Coruripe', 'Loja Teotonio Vilela'] }
    : { required: false, options: [] });
  q.resolveUnitName.mockReturnValue('Card');
  q.insertEmployeeFromPanel.mockImplementation(async input => ({ id: 131, ...input, created_at: 'now', created_via: 'painel_rh' }) as any);
  s.fetchEmployeeRoster.mockImplementation(async showFired => (showFired ? [JOSENILDO] : [VITORIA]) as any);
  // Outbound HTTP: the local test server passes; Slack only answers users.list
  jest.spyOn(global, 'fetch').mockImplementation(async (input: any, init?: any) => {
    const url = String(input);
    if (url.startsWith(baseUrl)) return realFetch(input, init);
    outboundCalls.push(`${init?.method ?? 'GET'} ${url}`);
    if (url.startsWith('https://slack.com/api/users.list')) {
      return new Response(JSON.stringify({ ok: true, members: [
        { id: 'U0CC48K97EX', real_name: 'Vitoria Regina', profile: { display_name: '', email: 'vitoria@x.com' } },
        { id: 'U08JFCGBFSA', real_name: 'Anny Karoline', profile: { display_name: '', email: 'anny@x.com' } },
      ] }), { status: 200 });
    }
    throw new Error(`unexpected outbound call: ${url}`);
  });
});

afterEach(() => {
  (global.fetch as jest.Mock).mockRestore?.();
  // Nothing in these flows may send a Slack message
  expect(b.sendEmployeeAlert).not.toHaveBeenCalled();
  expect(b.sendManagerDailySummary).not.toHaveBeenCalled();
  expect(outboundCalls.every(c => c.startsWith('GET https://slack.com/api/users.list'))).toBe(true);
});

function call(method: string, path: string, body?: unknown, token = rhToken) {
  return fetch(`${baseUrl}/api/admin${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe('access', () => {
  it('only the RH (admin) login reaches these routes', async () => {
    expect((await fetch(`${baseUrl}/api/admin/solides/roster`)).status).toBe(401);
    expect((await call('GET', '/solides/roster', undefined, gestorToken)).status).toBe(403);
  });
});

describe('GET /solides/roster', () => {
  it('lists active Sólides people and the gestores with their store choices and default substitute', async () => {
    const res = await call('GET', '/solides/roster');
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.people).toEqual([{ solides_id: '7187482', name: 'Vitoria Regina Lúcio da Silva', admission_date: '2026-10-27', records_punch: true, registered_as: null, homonym_of: null }]);
    expect(JSON.stringify(body)).not.toContain('vitoria@x.com'); // the e-mail never leaves the backend
    const taciane = body.leaders.find((l: any) => l.id === 11);
    expect(taciane).toMatchObject({ units: { required: true }, kind: 'cards', own_card: null, default_secondary_approver_id: 10 });
    expect(body.leaders.find((l: any) => l.id === 12)).toMatchObject({ kind: 'own', own_card: 'Card' });
    expect(body.leaders.map((l: any) => l.id)).not.toContain(14); // hidden leader is not offered
    expect(body.card_defaults).toEqual({ Card: { journey: 'padrao', saturday: 'ate_12' } });
    expect(s.fetchEmployeeRoster).toHaveBeenCalledWith(false);
  });

  it('Sólides down → 502, nothing else happens', async () => {
    s.fetchEmployeeRoster.mockRejectedValue(new Error('500'));
    expect((await call('GET', '/solides/roster')).status).toBe(502);
  });
});

describe('GET /solides/:id/slack-suggestions', () => {
  it('matches the Slack account by e-mail and marks accounts in use', async () => {
    const res = await call('GET', '/solides/7187482/slack-suggestions');
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.suggestions[0]).toMatchObject({ slack_id: 'U0CC48K97EX', match: 'email', in_use_by: null });
    expect(outboundCalls).toEqual(['GET https://slack.com/api/users.list?limit=200']);
  });

  it('unknown person → 404', async () => {
    expect((await call('GET', '/solides/1/slack-suggestions')).status).toBe(404);
  });
});

describe('POST /employees/import', () => {
  it('registers with the name/admission from Sólides and logs it — no Slack message', async () => {
    const res = await call('POST', '/employees/import', { solides_employee_id: '7187482', leader_id: 12, slack_id: 'U0CC48K97EX', saturday: 'ate_14' });
    expect(res.status).toBe(201);
    expect(q.insertEmployeeFromPanel).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Vitoria Regina Lúcio da Silva', solides_employee_id: '7187482', leader_id: 12, saturday_minutes: 360, admission_date: '2026-10-27',
    }));
    expect(q.logAudit).toHaveBeenCalledWith('EMPLOYEE_IMPORTED', 'employee', 131, expect.stringContaining('Mariane Santos Sousa'));
    expect(s.fetchEmployeeRoster).toHaveBeenCalledWith(false); // a fresh read
  });

  it('a hidden (dismissed) leader cannot be chosen as gestor', async () => {
    const res = await call('POST', '/employees/import', { solides_employee_id: '7187482', leader_id: 14 });
    expect(res.status).toBe(400);
    expect(q.insertEmployeeFromPanel).not.toHaveBeenCalled();
  });

  it('store required for a gestor with several stores', async () => {
    const res = await call('POST', '/employees/import', { solides_employee_id: '7187482', leader_id: 11 });
    expect(res.status).toBe(400);
    expect(q.insertEmployeeFromPanel).not.toHaveBeenCalled();
  });

  it('conflict found inside the transaction → 409', async () => {
    q.insertEmployeeFromPanel.mockRejectedValue(Object.assign(new Error('Essa pessoa já está cadastrada'), { name: 'EmployeeConflictError' }));
    const res = await call('POST', '/employees/import', { solides_employee_id: '7187482', leader_id: 12 });
    expect(res.status).toBe(409);
    expect(((await res.json()) as any).error).toContain('já está cadastrada');
    expect(q.logAudit).not.toHaveBeenCalled();
  });

  it('Sólides down → 502 and nothing is written', async () => {
    s.fetchEmployeeRoster.mockRejectedValue(new Error('500'));
    expect((await call('POST', '/employees/import', { solides_employee_id: '7187482', leader_id: 12 })).status).toBe(502);
    expect(q.insertEmployeeFromPanel).not.toHaveBeenCalled();
  });
});

describe('removal', () => {
  it('summary shows what is touched and the Sólides status', async () => {
    q.getEmployeeRemovalSummary.mockResolvedValue({ daily_records: 150, folgas: 4, vacation_schedules: 1, pending_justifications: 0, pending_adjustments: 1, also_leader: null });
    q.getEmployeeById.mockResolvedValue({ id: 105, name: 'Josenildo Alves', leader_id: 11, solides_employee_id: '6349128' } as any);
    const res = await call('GET', '/employee/105/removal-summary');
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.solides).toEqual({ status: 'demitido', name: 'Josenildo Alves da silva Júnior' });
    expect(body.summary.daily_records).toBe(150);
  });

  it('Sólides down does not block the summary', async () => {
    q.getEmployeeRemovalSummary.mockResolvedValue({ daily_records: 0, folgas: 0, vacation_schedules: 0, pending_justifications: 0, pending_adjustments: 0, also_leader: null });
    s.fetchEmployeeRoster.mockRejectedValue(new Error('500'));
    const body: any = await (await call('GET', '/employee/64/removal-summary')).json();
    expect(body.solides.status).toBe('indisponivel');
  });

  it('removes registration + vacation due dates and logs it', async () => {
    q.removeEmployeeKeepingHistory.mockResolvedValue({ vacation_schedules_removed: 1 });
    const res = await call('DELETE', '/employee/64');
    expect(res.status).toBe(200);
    expect(q.removeEmployeeKeepingHistory).toHaveBeenCalledWith(64);
    expect(q.logAudit).toHaveBeenCalledWith('EMPLOYEE_DELETED', 'employee', 64, expect.stringContaining('histórico mantido'));
  });

  it('unknown employee → 404, nothing removed', async () => {
    const res = await call('DELETE', '/employee/999');
    expect(res.status).toBe(404);
    expect(q.removeEmployeeKeepingHistory).not.toHaveBeenCalled();
  });

  it('someone still active in Sólides is only removed with the panel confirmation', async () => {
    q.getEmployeeById.mockResolvedValue({ id: 130, name: 'Vitoria Regina Lúcio da Silva', leader_id: 12, solides_employee_id: '7187482' } as any);
    q.removeEmployeeKeepingHistory.mockResolvedValue({ vacation_schedules_removed: 0 });
    const refused = await call('DELETE', '/employee/130');
    expect(refused.status).toBe(409);
    expect(q.removeEmployeeKeepingHistory).not.toHaveBeenCalled();
    const confirmed = await call('DELETE', '/employee/130?confirmar_ativo=1');
    expect(confirmed.status).toBe(200);
    expect(q.removeEmployeeKeepingHistory).toHaveBeenCalledWith(130);
    expect(q.logAudit).toHaveBeenCalledWith('EMPLOYEE_DELETED', 'employee', 130, expect.stringContaining('ainda ativo na Sólides'));
  });
});

describe('trocar gestor', () => {
  const SANDRA = {
    id: 32, name: 'Sandra da Conceição Freitas', slack_id: 'U0A1P79UK0T', leader_id: 12, secondary_approver_id: null,
    unit_name: null, no_punch_required: false, alert_cover_leader_id: 10, is_apprentice: false, works_saturday: true,
  };
  const FROM = { leader_id: 12, secondary_approver_id: null, unit_name: null, saturday: 'ate_12', alert_cover_leader_id: 10 };

  beforeEach(() => {
    q.getEmployeeFresh.mockResolvedValue({ ...SANDRA } as any);
    q.getEmployeeRemovalSummary.mockResolvedValue({ daily_records: 90, folgas: 0, vacation_schedules: 0, pending_justifications: 1, pending_adjustments: 2, also_leader: null });
    q.resolveUnitName.mockImplementation((e: any) => (e.leader_id === 12 ? 'Loja Penedo' : e.unit_name ?? null));
  });

  it('only the RH reaches it', async () => {
    expect((await call('POST', '/employee/32/transfer', { leader_id: 10, from: FROM }, gestorToken)).status).toBe(403);
    expect(q.transferEmployee).not.toHaveBeenCalled();
  });

  it('options: current registration (fresh read), pending requests and the gestores', async () => {
    const res = await call('GET', '/employee/32/transfer-options');
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.employee).toMatchObject({
      id: 32, leader_id: 12, leader_name: 'Mariane Santos Sousa', card: 'Loja Penedo', journey: 'padrao', saturday: 'ate_12',
      alert_cover_name: 'Kemilly Rafaelly Souza Silva',
    });
    expect(body.pending).toEqual({ adjustments: 2, justifications: 1 });
    expect(body.leaders.map((l: any) => l.id)).not.toContain(14);
    expect(q.getEmployeeFresh).toHaveBeenCalledWith(32);
  });

  it('moves, writes only what changed, logs it — no Slack message', async () => {
    const res = await call('POST', '/employee/32/transfer', { leader_id: 11, unit_name: 'Loja Coruripe', secondary_approver_id: 10, from: FROM });
    expect(res.status).toBe(200);
    // The transaction is guarded by the same fresh registration the change was computed from
    expect(q.transferEmployee).toHaveBeenCalledWith(32, expect.objectContaining({ id: 32, leader_id: 12, alert_cover_leader_id: 10 }), {
      leader_id: 11, unit_name: 'Loja Coruripe', secondary_approver_id: 10, alert_cover_leader_id: null,
    });
    const log = (q.logAudit as jest.Mock).mock.calls[0];
    expect(log.slice(0, 3)).toEqual(['EMPLOYEE_TRANSFERRED', 'employee', 32]);
    expect(log[3]).toContain('Mariane Santos Sousa → Maria Taciane Pereira Barbosa');
    expect(log[3]).toContain('card Loja Penedo → Loja Coruripe');
    expect(log[3]).toContain('desvio de alertas para Kemilly Rafaelly Souza Silva removido');
  });

  it('the registration changed since the form opened → 409, nothing written', async () => {
    const res = await call('POST', '/employee/32/transfer', { leader_id: 11, unit_name: 'Loja Coruripe', from: { ...FROM, leader_id: 7 } });
    expect(res.status).toBe(409);
    expect(q.transferEmployee).not.toHaveBeenCalled();
    expect(q.logAudit).not.toHaveBeenCalled();
  });

  it('Saturday or alert detour changed by someone else since the form opened → 409', async () => {
    q.getEmployeeFresh.mockResolvedValue({ ...SANDRA, saturday_minutes: 360 } as any); // now until 14h
    expect((await call('POST', '/employee/32/transfer', { leader_id: 10, saturday: 'ate_12', from: FROM })).status).toBe(409);
    q.getEmployeeFresh.mockResolvedValue({ ...SANDRA, alert_cover_leader_id: 12 } as any);
    expect((await call('POST', '/employee/32/transfer', { leader_id: 10, saturday: 'ate_12', from: FROM })).status).toBe(409);
    expect(q.transferEmployee).not.toHaveBeenCalled();
  });

  it('someone without a gestor (leader_id null) can be given one', async () => {
    q.getEmployeeFresh.mockResolvedValue({ ...SANDRA, leader_id: null, alert_cover_leader_id: null } as any);
    const options: any = await (await call('GET', '/employee/32/transfer-options')).json();
    expect(options.employee.leader_id).toBeNull();
    const res = await call('POST', '/employee/32/transfer', {
      leader_id: 12, saturday: 'ate_12', from: { ...FROM, leader_id: null, alert_cover_leader_id: null },
    });
    expect(res.status).toBe(200);
    expect(q.transferEmployee).toHaveBeenCalledWith(32, expect.anything(), { leader_id: 12, unit_name: null });
  });

  it('hidden gestores: never suggested nor offered, except as the current one', async () => {
    q.getAllEmployees.mockResolvedValue([{ ...TEAM_11[0], secondary_approver_id: 14 }, { ...TEAM_11[1], secondary_approver_id: 14 }] as any);
    q.getEmployeeFresh.mockResolvedValue({ ...SANDRA, secondary_approver_id: 14 } as any);
    const body: any = await (await call('GET', '/employee/32/transfer-options')).json();
    expect(body.leaders.find((l: any) => l.id === 11).default_secondary_approver_id).toBeNull();
    expect(body.leaders.find((l: any) => l.id === 14)).toMatchObject({ hidden: true });
    const roster: any = await (await call('GET', '/solides/roster')).json();
    expect(roster.leaders.map((l: any) => l.id)).not.toContain(14);
  });

  it('the change is saved even if the audit log fails afterwards', async () => {
    q.logAudit.mockRejectedValue(new Error('firestore down'));
    const res = await call('POST', '/employee/32/transfer', { leader_id: 10, saturday: 'ate_12', from: FROM });
    expect(res.status).toBe(200);
    expect(q.transferEmployee).toHaveBeenCalled();
  });

  it('a change found inside the transaction → 409, not logged', async () => {
    q.transferEmployee.mockRejectedValue(Object.assign(new Error('O cadastro dessa pessoa mudou'), { name: 'EmployeeChangedError' }));
    const res = await call('POST', '/employee/32/transfer', { leader_id: 10, from: FROM });
    expect(res.status).toBe(409);
    expect(q.logAudit).not.toHaveBeenCalled();
  });

  it('invalid choices → 400, nothing written', async () => {
    expect((await call('POST', '/employee/32/transfer', { leader_id: 14, from: FROM })).status).toBe(400);  // hidden gestor
    expect((await call('POST', '/employee/32/transfer', { leader_id: 11, from: FROM })).status).toBe(400);  // store missing
    expect((await call('POST', '/employee/32/transfer', { leader_id: 12, from: FROM })).status).toBe(400);  // nothing changed
    expect(q.transferEmployee).not.toHaveBeenCalled();
  });

  it('unknown employee → 404', async () => {
    q.getEmployeeFresh.mockResolvedValue(undefined);
    expect((await call('POST', '/employee/999/transfer', { leader_id: 10, from: FROM })).status).toBe(404);
    expect((await call('GET', '/employee/999/transfer-options')).status).toBe(404);
  });
});

describe('GET /solides/pendencias', () => {
  it('reads both Sólides lists and returns the pendências', async () => {
    q.getAllEmployees.mockResolvedValue([{ id: 105, name: 'Josenildo Alves', leader_id: 11, leader_name: 'Taciane', solides_employee_id: '6349128', no_punch_required: false }] as any);
    const res = await call('GET', '/solides/pendencias');
    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.demitidos_no_databank.map((e: any) => e.id)).toEqual([105]);
    expect(body.nao_cadastrados.map((e: any) => e.solides_id)).toEqual(['7187482']);
    expect(s.fetchEmployeeRoster).toHaveBeenCalledWith(false);
    expect(s.fetchEmployeeRoster).toHaveBeenCalledWith(true);
  });
});
