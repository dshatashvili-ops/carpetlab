import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { admin, createTestApp, registerOwner, resetDb } from './support/app';

describe('service admin', () => {
  let app: INestApplication; let owner: string[]; let orgId: string;
  const api = () => request(app.getHttpServer());

  beforeEach(async () => {
    await resetDb(); ({ app } = await createTestApp()); owner = await registerOwner(app);
    orgId = (await admin.organization.findFirstOrThrow()).id;
    await admin.article.create({ data: { orgId, code: '1', name: 'a', rollWidthCm: 150, cutMode: 'LINEAR' } });
  });
  afterEach(async () => { await app.close(); });
  afterAll(async () => { await admin.$disconnect(); });

  const makeAdmin = () => admin.user.updateMany({ data: { isServiceAdmin: true } });

  it.each([['GET', '/api/admin/orgs'], ['GET', '/api/admin/invoices'], ['PUT', '/api/admin/tariff-prices']])('%s %s is 403 for an ordinary organization owner', async (method, url) => {
    const res = await (api() as unknown as Record<string, (u: string) => request.Test>)[method.toLowerCase()](url).set('Cookie', owner).send({ prices: [] });
    expect(res.status).toBe(403);
  });

  it('lists organizations with owners, subscription and usage', async () => {
    await makeAdmin();
    const res = await api().get('/api/admin/orgs').set('Cookie', owner);
    expect(res.status).toBe(200);
    expect(res.body).toEqual([expect.objectContaining({
      id: orgId, name: 'Ковры+', owners: ['owner@example.com'], articlesCount: 1, membersCount: 1,
      subscription: expect.objectContaining({ plan: 1, status: 'TRIAL' }),
    })]);
  });

  it('lists invoices and filters them by status', async () => {
    await makeAdmin();
    await admin.payment.createMany({ data: [
      { orgId, method: 'INVOICE', plan: 2, months: 3, amountKopecks: 450_000, status: 'PENDING' },
      { orgId, method: 'INVOICE', plan: 1, months: 1, amountKopecks: 150_000, status: 'SUCCEEDED', appliedAt: new Date() },
      { orgId, method: 'YOOKASSA', plan: 1, months: 1, amountKopecks: 150_000, status: 'PENDING', externalId: 'yk-1' },
    ] });
    const all = await api().get('/api/admin/invoices').set('Cookie', owner);
    expect(all.body).toHaveLength(2);
    const pending = await api().get('/api/admin/invoices?status=PENDING').set('Cookie', owner);
    expect(pending.body).toEqual([expect.objectContaining({ plan: 2, months: 3, amountKopecks: 450_000, orgName: 'Ковры+', status: 'PENDING' })]);
  });

  it('sets tariff prices (upsert) and checkout then uses them', async () => {
    await makeAdmin();
    const put = await api().put('/api/admin/tariff-prices').set('Cookie', owner).send({ prices: [{ plan: 1, months: 1, priceKopecks: 150_000 }, { plan: 1, months: 12, priceKopecks: 1_500_000 }] });
    expect(put.status).toBe(200);
    await api().put('/api/admin/tariff-prices').set('Cookie', owner).send({ prices: [{ plan: 1, months: 1, priceKopecks: 190_000 }] }).expect(200);
    const prices = await api().get('/api/billing/prices').set('Cookie', owner);
    expect(prices.body).toEqual([{ plan: 1, months: 1, priceKopecks: 190_000 }, { plan: 1, months: 12, priceKopecks: 1_500_000 }]);
    const checkout = await api().post('/api/billing/checkout').set('Cookie', owner).send({ plan: 1, months: 1, method: 'INVOICE' });
    expect(checkout.body.invoice.amountKopecks).toBe(190_000);
  });

  it('an invalid price list is rejected as a whole (nothing is saved)', async () => {
    await makeAdmin();
    const res = await api().put('/api/admin/tariff-prices').set('Cookie', owner).send({ prices: [{ plan: 1, months: 1, priceKopecks: 100_000 }, { plan: 4, months: 1, priceKopecks: 100_000 }] });
    expect(res.status).toBe(400);
    expect(await admin.tariffPrice.count()).toBe(0);
    for (const bad of [{ plan: 1, months: 2, priceKopecks: 1 }, { plan: 1, months: 1, priceKopecks: 0 }, { plan: 1, months: 1, priceKopecks: 10.5 }]) {
      expect((await api().put('/api/admin/tariff-prices').set('Cookie', owner).send({ prices: [bad] })).status).toBe(400);
    }
  });
});
