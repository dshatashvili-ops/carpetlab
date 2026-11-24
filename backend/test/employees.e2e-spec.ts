import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { addEmployee, admin, createTestApp, FakeMailer, registerOwner, resetDb } from './support/app';

describe('employees', () => {
  let app: INestApplication; let mailer: FakeMailer; let owner: string[];
  beforeEach(async () => { await resetDb(); ({ app, mailer } = await createTestApp()); owner = await registerOwner(app); });
  afterEach(async () => { await app.close(); });
  afterAll(async () => { await admin.$disconnect(); });

  it('an OPERATOR cannot invite employees (403)', async () => {
    const op = await addEmployee(app, mailer, owner, 'op@example.com', 'OPERATOR');
    const res = await request(app.getHttpServer()).post('/api/employees').set('Cookie', op).send({ email: 'x@example.com', role: 'CUTTER' });
    expect(res.status).toBe(403);
  });

  it('the owner invites an employee: 201 and an invitation e-mail is sent', async () => {
    const res = await request(app.getHttpServer()).post('/api/employees').set('Cookie', owner).send({ email: 'cut@example.com', role: 'CUTTER' });
    expect(res.status).toBe(201);
    expect(mailer.sent.some((m) => m.to === 'cut@example.com')).toBe(true);
  });

  it('an accepted invitation gives the employee the invited role', async () => {
    const cutter = await addEmployee(app, mailer, owner, 'cut@example.com', 'CUTTER');
    const me = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', cutter);
    expect(me.body.role).toBe('CUTTER');
  });

  it('the last owner cannot be demoted or removed (409)', async () => {
    const list = await request(app.getHttpServer()).get('/api/employees').set('Cookie', owner);
    const self = list.body.members[0];
    const demote = await request(app.getHttpServer()).patch(`/api/employees/${self.id}`).set('Cookie', owner).send({ role: 'OPERATOR' });
    expect(demote.status).toBe(409);
    const remove = await request(app.getHttpServer()).delete(`/api/employees/${self.id}`).set('Cookie', owner);
    expect(remove.status).toBe(409);
  });

  it('the owner can change a role and remove an employee', async () => {
    await addEmployee(app, mailer, owner, 'op@example.com', 'OPERATOR');
    const list = await request(app.getHttpServer()).get('/api/employees').set('Cookie', owner);
    const op = list.body.members.find((m: { email: string }) => m.email === 'op@example.com');
    const patch = await request(app.getHttpServer()).patch(`/api/employees/${op.id}`).set('Cookie', owner).send({ role: 'CUTTER' });
    expect(patch.status).toBe(200);
    expect(patch.body.role).toBe('CUTTER');
    const del = await request(app.getHttpServer()).delete(`/api/employees/${op.id}`).set('Cookie', owner);
    expect(del.status).toBe(204);
  });
});
