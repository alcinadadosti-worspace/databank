import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import * as queries from '../../models/queries';
import * as certs from '../../services/medical-certificates';
import { refreshStoredDaysSafe } from '../../services/day-recalc';
import { generateToken } from '../../middleware/auth';
import router from '../../routes/medical-certificates';

jest.mock('../../models/queries', () => ({
  getEmployeesByLeaderId: jest.fn(),
  getAllEmployees: jest.fn(),
  getEmployeeById: jest.fn(),
  getMedicalLeavesInRange: jest.fn(),
  getMedicalLeave: jest.fn(),
  insertMedicalLeave: jest.fn(),
  setMedicalLeaveCertificates: jest.fn(),
  deleteMedicalLeave: jest.fn(),
  logAudit: jest.fn(),
}));
jest.mock('../../services/day-recalc', () => ({ refreshStoredDaysSafe: jest.fn() }));
// Real file-type check; Storage calls mocked
jest.mock('../../services/medical-certificates', () => ({
  ...jest.requireActual('../../services/medical-certificates'),
  saveCertificate: jest.fn(),
  deleteCertificate: jest.fn(),
  getCertificate: jest.fn(),
  listCertificates: jest.fn(),
  readCertificateFile: jest.fn(),
}));

const q = queries as jest.Mocked<typeof queries>;
const c = certs as jest.Mocked<typeof certs>;

const GESTOR_ID = 7;
const TEAM_MEMBER = { id: 32, name: 'Sandra', leader_id: GESTOR_ID, leader_name: 'Erick' };
const OTHER_TEAM = { id: 50, name: 'Camille', leader_id: 11, leader_name: 'Maria Taciane' };
const gestorToken = generateToken({ id: GESTOR_ID, name: 'Erick', role: 'manager', email: 'erick@x.com' });
const rhToken = generateToken({ id: 0, name: 'Administrador RH', role: 'admin' });
const PDF = Buffer.from('%PDF-1.7\n...');

function leave(overrides: Partial<queries.MedicalLeave> = {}): queries.MedicalLeave {
  return {
    id: 'L1', employee_id: TEAM_MEMBER.id, kind: 'days', start_date: '2026-10-28', end_date: '2026-10-29',
    days: 2, hours: null, notes: null, certificate_ids: [], created_at: '2026-10-28T12:00:00Z',
    created_by: 'Erick', created_by_role: 'manager', created_by_leader_id: GESTOR_ID, ...overrides,
  };
}

let server: Server;
let baseUrl: string;

beforeAll(done => {
  const app = express();
  app.use('/api/medical-certificates', router);
  server = app.listen(0, () => {
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    done();
  });
});

afterAll(done => { server.close(done); });

beforeEach(() => {
  jest.resetAllMocks();
  q.getEmployeesByLeaderId.mockResolvedValue([TEAM_MEMBER] as any);
  q.getAllEmployees.mockResolvedValue([TEAM_MEMBER, OTHER_TEAM] as any);
  q.getEmployeeById.mockImplementation(async id => [TEAM_MEMBER, OTHER_TEAM].find(e => e.id === id) as any);
  q.getMedicalLeavesInRange.mockResolvedValue([]);
  q.insertMedicalLeave.mockImplementation(async data => ({ ...data, id: 'NEW', certificate_ids: [], created_at: '' }));
  c.saveCertificate.mockImplementation(async input => ({ id: `C-${input.originalName}` }) as any);
});

function launch(token: string, employeeId: number, withFile = true) {
  const form = new FormData();
  form.append('employee_id', String(employeeId));
  form.append('kind', 'days');
  form.append('start_date', '2026-10-28');
  form.append('days', '2');
  if (withFile) form.append('files', new Blob([PDF], { type: 'application/pdf' }), 'atestado.pdf');
  return fetch(`${baseUrl}/api/medical-certificates/leaves`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form,
  });
}

const del = (token: string, id = 'L1') =>
  fetch(`${baseUrl}/api/medical-certificates/leaves/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });

describe('gestor launches atestado', () => {
  it('for their team, with the file: saved as launched by the gestor', async () => {
    const res = await launch(gestorToken, TEAM_MEMBER.id);
    expect(res.status).toBe(201);
    expect(q.insertMedicalLeave).toHaveBeenCalledWith(expect.objectContaining({
      employee_id: TEAM_MEMBER.id, end_date: '2026-10-29', created_by: 'Erick',
      created_by_role: 'manager', created_by_leader_id: GESTOR_ID,
    }));
    expect(c.saveCertificate).toHaveBeenCalledWith(expect.objectContaining({ flow: 'rh', uploadedBy: 'manager' }));
    expect(q.setMedicalLeaveCertificates).toHaveBeenCalledWith('NEW', ['C-atestado.pdf']);
  });

  it('refuses someone outside the team', async () => {
    const res = await launch(gestorToken, OTHER_TEAM.id);
    expect(res.status).toBe(403);
    expect(q.insertMedicalLeave).not.toHaveBeenCalled();
  });

  it('over an RH atestado: told to ask the RH, since they cannot delete it', async () => {
    q.getMedicalLeavesInRange.mockResolvedValue([leave({ created_by_role: 'rh', created_by_leader_id: null })]);
    const res = await launch(gestorToken, TEAM_MEMBER.id);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toMatch(/fale com o RH/);
    expect(q.insertMedicalLeave).not.toHaveBeenCalled();
  });

  it('requires the file', async () => {
    const res = await launch(gestorToken, TEAM_MEMBER.id, false);
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: string }).error).toMatch(/Anexe o arquivo/);
    expect(q.insertMedicalLeave).not.toHaveBeenCalled();
  });
});

describe('RH launches atestado', () => {
  it('for anyone, file optional', async () => {
    const res = await launch(rhToken, OTHER_TEAM.id, false);
    expect(res.status).toBe(201);
    expect(q.insertMedicalLeave).toHaveBeenCalledWith(expect.objectContaining({
      employee_id: OTHER_TEAM.id, created_by_role: 'rh', created_by_leader_id: null,
    }));
  });
});

describe('listing leaves', () => {
  it('a gestor can delete only what they launched; legacy atestados count as RH', async () => {
    q.getMedicalLeavesInRange.mockResolvedValue([
      leave({ id: 'MINE' }),
      leave({ id: 'RH', created_by: 'Administrador RH', created_by_role: 'rh', created_by_leader_id: null }),
      leave({ id: 'LEGACY', created_by_role: undefined, created_by_leader_id: undefined }),
      leave({ id: 'OTHER', employee_id: OTHER_TEAM.id, created_by_leader_id: 11 }),
    ]);
    const res = await fetch(`${baseUrl}/api/medical-certificates/leaves?start=2026-10-01&end=2026-10-31`, {
      headers: { Authorization: `Bearer ${gestorToken}` },
    });
    const { leaves } = (await res.json()) as { leaves: any[] };
    expect(leaves.map((l: any) => [l.id, l.created_by_role, l.can_delete])).toEqual([
      ['MINE', 'manager', true],
      ['RH', 'rh', false],
      ['LEGACY', 'rh', false],
    ]);
  });
});

describe('deleting leaves', () => {
  it('the gestor deletes their own, with its files, and the days are re-evaluated', async () => {
    q.getMedicalLeave.mockResolvedValue(leave({ certificate_ids: ['C1'] }));
    c.getCertificate.mockResolvedValue({ id: 'C1' } as any);
    const res = await del(gestorToken);
    expect(res.status).toBe(200);
    expect(c.deleteCertificate).toHaveBeenCalledWith({ id: 'C1' });
    expect(q.deleteMedicalLeave).toHaveBeenCalledWith('L1');
    expect(refreshStoredDaysSafe).toHaveBeenCalledWith(TEAM_MEMBER.id, '2026-10-28', '2026-10-29', { releaseAtestado: true });
  });

  it("the gestor can't delete one the RH launched", async () => {
    q.getMedicalLeave.mockResolvedValue(leave({ created_by_role: 'rh', created_by_leader_id: null }));
    expect((await del(gestorToken)).status).toBe(403);
    expect(q.deleteMedicalLeave).not.toHaveBeenCalled();
  });

  it('another team\'s atestado looks like it does not exist', async () => {
    q.getMedicalLeave.mockResolvedValue(leave({ employee_id: OTHER_TEAM.id, created_by_leader_id: 11 }));
    expect((await del(gestorToken)).status).toBe(404);
    expect(q.deleteMedicalLeave).not.toHaveBeenCalled();
  });

  it('the RH deletes one a gestor launched', async () => {
    q.getMedicalLeave.mockResolvedValue(leave());
    expect((await del(rhToken)).status).toBe(200);
    expect(q.deleteMedicalLeave).toHaveBeenCalledWith('L1');
  });
});
