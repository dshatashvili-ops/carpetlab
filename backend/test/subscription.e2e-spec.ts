import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { LimitsService } from '../src/subscription/limits.service';
import { admin, createTestApp, FakeMailer, registerOwner, resetDb } from './support/app';

describe('subscription', () => {
  let app: INestApplication; let mailer: FakeMailer; let owner: string[]; let orgId: string;
  beforeEach(async () => {
    await resetDb(); ({ app, mailer } = await createTestApp()); owner = await registerOwner(app);
    orgId = (await admin.organization.findFirstOrThrow()).id;
  });
  afterEach(async () => { await app.close(); });
  afterAll(async () => { await admin.$disconnect(); });

  const seedArticles = async (n: number) => {
    for (let i = 0; i < n; i++) await admin.article.create({ data: { orgId, code: `A${i}`, name: `a${i}`, rollWidthCm: 150, cutMode: 'LINEAR' } });
  };

  it('a new organization is on TRIAL with 7 days left and plan 1', async () => {
    const res = await request(app.getHttpServer()).get('/api/subscription').set('Cookie', owner);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'TRIAL', plan: 1, daysLeft: 7 });
  });

  it('the 11th article on plan 1 is rejected with LIMIT_REACHED, the 10th is allowed', async () => {
    const limits = app.get(LimitsService);
    await seedArticles(9);
    await expect(limits.assertCanAdd(orgId, 'article')).resolves.toBeUndefined();
    await seedArticles(0); await admin.article.create({ data: { orgId, code: 'A9', name: 'a9', rollWidthCm: 150, cutMode: 'LINEAR' } });
    await expect(limits.assertCanAdd(orgId, 'article')).rejects.toMatchObject({ response: { code: 'LIMIT_REACHED' } });
  });

  it('a downgrade below current usage blocks new articles but deletes nothing', async () => {
    await admin.subscription.update({ where: { orgId }, data: { plan: 2, status: 'ACTIVE' } });
    await seedArticles(12);
    await admin.subscription.update({ where: { orgId }, data: { plan: 1 } });
    await expect(app.get(LimitsService).assertCanAdd(orgId, 'article')).rejects.toMatchObject({ response: { code: 'LIMIT_REACHED' } });
    expect(await admin.article.count({ where: { orgId } })).toBe(12);
  });

  it('plan 1 allows 3 employees: the 4th invitation is rejected with LIMIT_REACHED', async () => {
    await request(app.getHttpServer()).post('/api/employees').set('Cookie', owner).send({ email: 'a@example.com', role: 'OPERATOR' }).expect(201);
    await request(app.getHttpServer()).post('/api/employees').set('Cookie', owner).send({ email: 'b@example.com', role: 'CUTTER' }).expect(201);
    const res = await request(app.getHttpServer()).post('/api/employees').set('Cookie', owner).send({ email: 'c@example.com', role: 'CUTTER' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LIMIT_REACHED');
    expect(mailer.sent.some((m) => m.to === 'c@example.com')).toBe(false);
  });

  it('an expired subscription makes writes return 402 while reads still work', async () => {
    await admin.subscription.update({ where: { orgId }, data: { expiresAt: new Date(Date.now() - 86_400_000) } });
    const write = await request(app.getHttpServer()).post('/api/employees').set('Cookie', owner).send({ email: 'a@example.com', role: 'OPERATOR' });
    expect(write.status).toBe(402);
    const read = await request(app.getHttpServer()).get('/api/employees').set('Cookie', owner);
    expect(read.status).toBe(200);
    const sub = await request(app.getHttpServer()).get('/api/subscription').set('Cookie', owner);
    expect(sub.body.status).toBe('EXPIRED');
  });

  it('login still works after the subscription expired', async () => {
    await admin.subscription.update({ where: { orgId }, data: { expiresAt: new Date(Date.now() - 86_400_000) } });
    const res = await request(app.getHttpServer()).post('/api/auth/login').send({ email: 'owner@example.com', password: 'correct-horse-1' });
    expect(res.status).toBe(200);
  });
});
