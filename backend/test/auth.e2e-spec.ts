import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { admin, createTestApp, FakeMailer, resetDb } from './support/app';

describe('auth', () => {
  let app: INestApplication; let mailer: FakeMailer;
  const creds = { email: 'owner@example.com', password: 'correct-horse-1', orgName: 'Ковры+' };

  beforeEach(async () => { await resetDb(); ({ app, mailer } = await createTestApp()); });
  afterEach(async () => { await app.close(); });
  afterAll(async () => { await admin.$disconnect(); });

  it('register creates org, owner, trial subscription, cookie and verification e-mail', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/register').send(creds);
    expect(res.status).toBe(201);
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/i);
    const user = await admin.user.findUniqueOrThrow({ where: { email: creds.email } });
    expect(user.passwordHash.startsWith('$argon2')).toBe(true);
    const sub = await admin.subscription.findFirstOrThrow();
    expect(sub.status).toBe('TRIAL');
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toBe(creds.email);
  });

  it('register rejects a password shorter than 10 characters', async () => {
    const res = await request(app.getHttpServer()).post('/api/auth/register').send({ ...creds, password: 'short' });
    expect(res.status).toBe(400);
  });

  it('register with an existing e-mail returns 409', async () => {
    await request(app.getHttpServer()).post('/api/auth/register').send(creds);
    const res = await request(app.getHttpServer()).post('/api/auth/register').send(creds);
    expect(res.status).toBe(409);
  });

  it('login with a wrong password returns 401', async () => {
    await request(app.getHttpServer()).post('/api/auth/register').send(creds);
    const res = await request(app.getHttpServer()).post('/api/auth/login').send({ email: creds.email, password: 'wrong-password-1' });
    expect(res.status).toBe(401);
  });

  it('the 6th login attempt within a minute returns 429', async () => {
    await request(app.getHttpServer()).post('/api/auth/register').send(creds);
    const codes: number[] = [];
    for (let i = 0; i < 6; i++) {
      const r = await request(app.getHttpServer()).post('/api/auth/login').send({ email: creds.email, password: 'wrong-password-1' });
      codes.push(r.status);
    }
    expect(codes).toEqual([401, 401, 401, 401, 401, 429]);
  });

  it('GET /me without a cookie is 401; with the login cookie returns the session', async () => {
    expect((await request(app.getHttpServer()).get('/api/auth/me')).status).toBe(401);
    await request(app.getHttpServer()).post('/api/auth/register').send(creds);
    const login = await request(app.getHttpServer()).post('/api/auth/login').send({ email: creds.email, password: creds.password });
    expect(login.status).toBe(200);
    const me = await request(app.getHttpServer()).get('/api/auth/me').set('Cookie', login.headers['set-cookie']);
    expect(me.status).toBe(200);
    expect(me.body).toMatchObject({ role: 'OWNER', emailVerified: false, isServiceAdmin: false });
  });

  it('GET /verify marks the e-mail as verified', async () => {
    await request(app.getHttpServer()).post('/api/auth/register').send(creds);
    const token = /token=([a-f0-9]+)/.exec(mailer.sent[0].html)![1];
    const res = await request(app.getHttpServer()).get(`/api/auth/verify?token=${token}`);
    expect(res.status).toBe(200);
    const user = await admin.user.findUniqueOrThrow({ where: { email: creds.email } });
    expect(user.emailVerifiedAt).not.toBeNull();
  });
});
