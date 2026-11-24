import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { addEmployee, admin, createTestApp, FakeMailer, FakeYooKassa, registerOwner, resetDb } from './support/app';

const DAY = 86_400_000;

describe('payments', () => {
  let app: INestApplication; let mailer: FakeMailer; let yk: FakeYooKassa; let owner: string[]; let orgId: string;
  const api = () => request(app.getHttpServer());
  const checkout = (b: object, cookie = owner) => api().post('/api/billing/checkout').set('Cookie', cookie).send(b);
  const webhook = (id: string, status = 'succeeded') => api().post('/api/billing/yookassa/webhook').send({ event: `payment.${status}`, object: { id, status } });
  const sub = () => admin.subscription.findUniqueOrThrow({ where: { orgId } });
  const externalIdOf = async (paymentId: string) => (await admin.payment.findUniqueOrThrow({ where: { id: paymentId } })).externalId!;

  beforeEach(async () => {
    await resetDb(); ({ app, mailer, yookassa: yk } = await createTestApp()); owner = await registerOwner(app);
    orgId = (await admin.organization.findFirstOrThrow()).id;
    await admin.tariffPrice.createMany({ data: [{ plan: 2, months: 3, priceKopecks: 450_000 }, { plan: 1, months: 1, priceKopecks: 150_000 }] });
  });
  afterEach(async () => { await app.close(); });
  afterAll(async () => { await admin.$disconnect(); });

  it('a card checkout creates a pending payment for the configured price and returns the confirmation url', async () => {
    const res = await checkout({ plan: 2, months: 3, method: 'YOOKASSA' });
    expect(res.status).toBe(201);
    expect(res.body.confirmationUrl).toMatch(/^https:\/\/pay\.example\/confirm\//);
    const p = await admin.payment.findFirstOrThrow();
    expect(p).toMatchObject({ orgId, plan: 2, months: 3, amountKopecks: 450_000, status: 'PENDING', method: 'YOOKASSA' });
    expect(p.externalId).toBeTruthy();
    expect(yk.created[0].amountKopecks).toBe(450_000);
  });

  it('checkout without a configured price is 400; invalid plan/months/method are 400; an OPERATOR is 403', async () => {
    expect((await checkout({ plan: 3, months: 12, method: 'YOOKASSA' })).status).toBe(400);
    expect((await checkout({ plan: 9, months: 3, method: 'YOOKASSA' })).status).toBe(400);
    expect((await checkout({ plan: 2, months: 2, method: 'YOOKASSA' })).status).toBe(400);
    expect((await checkout({ plan: 2, months: 3, method: 'CASH' })).status).toBe(400);
    const op = await addEmployee(app, mailer, owner, 'op@example.com', 'OPERATOR');
    expect((await checkout({ plan: 2, months: 3, method: 'YOOKASSA' }, op)).status).toBe(403);
  });

  it('a succeeded webhook extends the subscription once, even when delivered twice', async () => {
    const before = await sub();
    const { body } = await checkout({ plan: 2, months: 3, method: 'YOOKASSA' });
    const externalId = await externalIdOf(body.paymentId);
    yk.payments.set(externalId, 'succeeded');
    expect((await webhook(externalId)).status).toBe(200);
    expect((await webhook(externalId)).status).toBe(200);
    const after = await sub();
    expect(after).toMatchObject({ plan: 2, status: 'ACTIVE' });
    const months = (after.expiresAt.getUTCFullYear() - before.expiresAt.getUTCFullYear()) * 12 + after.expiresAt.getUTCMonth() - before.expiresAt.getUTCMonth();
    expect(months).toBe(3);
    expect((await admin.payment.findUniqueOrThrow({ where: { id: body.paymentId } })).status).toBe('SUCCEEDED');
  });

  it('5 simultaneous webhooks for one payment still extend only once', async () => {
    const { body } = await checkout({ plan: 2, months: 3, method: 'YOOKASSA' });
    const externalId = await externalIdOf(body.paymentId);
    yk.payments.set(externalId, 'succeeded');
    const before = await sub();
    await Promise.all(Array.from({ length: 5 }, () => webhook(externalId)));
    const gain = (await sub()).expiresAt.getTime() - before.expiresAt.getTime();
    expect(gain).toBeGreaterThan(88 * DAY);
    expect(gain).toBeLessThan(95 * DAY);
  });

  it('the webhook body is not trusted: the API says pending, so nothing is applied', async () => {
    const { body } = await checkout({ plan: 2, months: 3, method: 'YOOKASSA' });
    const externalId = await externalIdOf(body.paymentId);
    const before = await sub();
    expect((await webhook(externalId, 'succeeded')).status).toBe(200);
    expect((await sub()).expiresAt.getTime()).toBe(before.expiresAt.getTime());
    expect((await admin.payment.findUniqueOrThrow({ where: { id: body.paymentId } })).status).toBe('PENDING');
  });

  it('a canceled payment is marked CANCELED and does not extend the subscription', async () => {
    const { body } = await checkout({ plan: 2, months: 3, method: 'YOOKASSA' });
    const externalId = await externalIdOf(body.paymentId);
    yk.payments.set(externalId, 'canceled');
    const before = await sub();
    await webhook(externalId, 'canceled');
    expect((await admin.payment.findUniqueOrThrow({ where: { id: body.paymentId } })).status).toBe('CANCELED');
    expect((await sub()).expiresAt.getTime()).toBe(before.expiresAt.getTime());
  });

  it('a webhook for an unknown payment id answers 200 without looking anything up', async () => {
    expect((await webhook('does-not-exist')).status).toBe(200);
    expect(yk.getCalls).toBe(0);
  });

  it('an expired subscription is extended from now, not from the past', async () => {
    await admin.subscription.update({ where: { orgId }, data: { expiresAt: new Date(Date.now() - 30 * DAY), status: 'EXPIRED' } });
    const { body } = await checkout({ plan: 1, months: 1, method: 'YOOKASSA' });
    expect(body.confirmationUrl).toBeTruthy();
    const externalId = await externalIdOf(body.paymentId);
    yk.payments.set(externalId, 'succeeded');
    await webhook(externalId);
    const s = await sub();
    expect(s.status).toBe('ACTIVE');
    expect(s.expiresAt.getTime()).toBeGreaterThan(Date.now() + 27 * DAY);
    expect(s.expiresAt.getTime()).toBeLessThan(Date.now() + 32 * DAY);
  });

  it('an invoice: created pending, only a service admin can mark it paid, and a second mark does not extend again', async () => {
    const created = await checkout({ plan: 2, months: 3, method: 'INVOICE' });
    expect(created.status).toBe(201);
    const id = created.body.paymentId;
    expect(created.body.invoice).toMatchObject({ amountKopecks: 450_000 });
    expect((await api().post(`/api/admin/invoices/${id}/mark-paid`).set('Cookie', owner)).status).toBe(403);

    await admin.user.updateMany({ data: { isServiceAdmin: true } });
    const before = await sub();
    const first = await api().post(`/api/admin/invoices/${id}/mark-paid`).set('Cookie', owner);
    expect(first.status).toBe(201);
    const afterFirst = await sub();
    expect(afterFirst.expiresAt.getTime()).toBeGreaterThan(before.expiresAt.getTime() + 85 * DAY);
    const second = await api().post(`/api/admin/invoices/${id}/mark-paid`).set('Cookie', owner);
    expect(second.status).toBe(201);
    expect(second.body.alreadyApplied).toBe(true);
    expect((await sub()).expiresAt.getTime()).toBe(afterFirst.expiresAt.getTime());
  });

  it('billing stays available when the subscription has expired (the owner must be able to pay)', async () => {
    await admin.subscription.update({ where: { orgId }, data: { expiresAt: new Date(Date.now() - DAY) } });
    expect((await checkout({ plan: 1, months: 1, method: 'INVOICE' })).status).toBe(201);
    expect((await api().get('/api/billing/prices').set('Cookie', owner)).status).toBe(200);
  });

  it('GET /api/billing/prices lists the configured prices', async () => {
    const res = await api().get('/api/billing/prices').set('Cookie', owner);
    expect(res.body).toEqual(expect.arrayContaining([{ plan: 1, months: 1, priceKopecks: 150_000 }, { plan: 2, months: 3, priceKopecks: 450_000 }]));
  });
});
