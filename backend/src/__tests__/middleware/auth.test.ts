import express from 'express';
import type { AddressInfo } from 'net';
import type { Server } from 'http';
import jwt from 'jsonwebtoken';
import { authAdmin, generateToken } from '../../middleware/auth';

// Same mounting as index.ts: app.use('/api/admin', authAdmin, adminRouter)
describe('authAdmin on /api/admin', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(done => {
    const app = express();
    const router = express.Router();
    router.get('/export', (_req, res) => { res.json({ ok: true }); });
    app.use('/api/admin', authAdmin, router);
    server = app.listen(0, () => {
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      done();
    });
  });

  afterAll(done => { server.close(done); });

  const get = (token?: string) =>
    fetch(`${baseUrl}/api/admin/export`, token ? { headers: { Authorization: `Bearer ${token}` } } : {});

  it('rejects requests without a token', async () => {
    expect((await get()).status).toBe(401);
  });

  it('rejects a token signed with another secret', async () => {
    const forged = jwt.sign({ id: 0, name: 'x', role: 'admin' }, 'not-the-real-secret-but-long-enough-32');
    expect((await get(forged)).status).toBe(401);
  });

  it('rejects a manager token', async () => {
    const token = generateToken({ id: 7, name: 'Gestor', role: 'manager' });
    expect((await get(token)).status).toBe(403);
  });

  it('accepts the RH admin token', async () => {
    const token = generateToken({ id: 0, name: 'Administrador RH', role: 'admin' });
    const res = await get(token);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});
