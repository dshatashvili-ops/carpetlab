import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { admin, createTestApp, registerOwner, resetDb } from './support/app';

describe('POST /api/cuts/calculate', () => {
  let app: INestApplication; let owner: string[]; let orgId: string; let userId: string; let articleId: string;
  const sizeIds: Record<string, string> = {};
  const api = () => request(app.getHttpServer());
  const calc = (b: object, cookie = owner) => api().post('/api/cuts/calculate').set('Cookie', cookie).send(b);

  beforeEach(async () => {
    await resetDb(); ({ app } = await createTestApp()); owner = await registerOwner(app);
    orgId = (await admin.organization.findFirstOrThrow()).id; userId = (await admin.user.findFirstOrThrow()).id;
    articleId = (await admin.article.create({ data: { orgId, code: '109029', name: 'Сахара', rollWidthCm: 150, cutMode: 'LINEAR' } })).id;
    for (const l of [100, 150, 200, 300]) sizeIds[`150x${l}`] = (await admin.sizeTemplate.create({ data: { orgId, widthCm: 150, lengthCm: l } })).id;
    await api().post('/api/stock/rolls').set('Cookie', owner).send({ articleId, widthCm: 150, lengthCm: 2500, count: 1 }).expect(201);
  });
  afterEach(async () => { await app.close(); });
  afterAll(async () => { await admin.$disconnect(); });

  it('without quantities it suggests an even split and reports used area', async () => {
    const res = await calc({ articleId, sizeIds: [sizeIds['150x150'], sizeIds['150x200'], sizeIds['150x300']] });
    expect(res.status).toBe(201);
    const qty = Object.fromEntries(res.body.requests.map((r: { sizeId: string; qty: number }) => [r.sizeId, r.qty]));
    expect(qty).toEqual({ [sizeIds['150x150']]: 3, [sizeIds['150x200']]: 4, [sizeIds['150x300']]: 4 });
    expect(res.body.plan.feasible).toBe(true);
    expect(res.body.usedAreaM2).toBe(36.75);
    expect(res.body.stock.materials).toHaveLength(1);
  });

  it('manual quantities that do not fit are reported as infeasible with the shortfall (not an error)', async () => {
    const res = await calc({ articleId, sizeIds: [sizeIds['150x300']], quantities: [{ sizeId: sizeIds['150x300'], qty: 9 }] });
    expect(res.status).toBe(201);
    expect(res.body.plan.feasible).toBe(false);
    expect(res.body.plan.shortfall).toEqual([{ sizeId: sizeIds['150x300'], missing: 1 }]);
  });

  it.each([-1, 1.5, '3'])('quantity %p is rejected with 400', async (qty) => {
    const res = await calc({ articleId, sizeIds: [sizeIds['150x300']], quantities: [{ sizeId: sizeIds['150x300'], qty }] });
    expect(res.status).toBe(400);
  });

  it('quantity 0 is allowed and places nothing', async () => {
    const res = await calc({ articleId, sizeIds: [sizeIds['150x300']], quantities: [{ sizeId: sizeIds['150x300'], qty: 0 }] });
    expect(res.status).toBe(201);
    expect(res.body.plan.placements).toEqual([]);
  });

  it('rejects an empty size list and quantities for sizes that were not selected (400)', async () => {
    expect((await calc({ articleId, sizeIds: [] })).status).toBe(400);
    const res = await calc({ articleId, sizeIds: [sizeIds['150x300']], quantities: [{ sizeId: sizeIds['150x200'], qty: 1 }] });
    expect(res.status).toBe(400);
  });

  it("another organization's article or size is 404", async () => {
    const other = await registerOwner(app, 'other@example.com');
    expect((await calc({ articleId, sizeIds: [sizeIds['150x300']] }, other)).status).toBe(404);
    const otherOrg = (await admin.organization.findMany()).find((o) => o.id !== orgId)!;
    const otherArticle = await admin.article.create({ data: { orgId: otherOrg.id, code: 'X', name: 'x', rollWidthCm: 150, cutMode: 'LINEAR' } });
    expect((await calc({ articleId: otherArticle.id, sizeIds: [sizeIds['150x300']] }, other)).status).toBe(404);
  });

  it('remnants of the same article take part in the calculation and are used first', async () => {
    const m = await admin.material.create({ data: { orgId, articleId, widthCm: 150, lengthCm: 100, kind: 'REMNANT' } });
    await admin.stockMovement.create({ data: { orgId, kind: 'RECEIPT', itemType: 'MATERIAL', materialId: m.id, qtyDelta: 1, userId } });
    const res = await calc({ articleId, sizeIds: [sizeIds['150x100']], quantities: [{ sizeId: sizeIds['150x100'], qty: 1 }] });
    expect(res.body.plan.placements[0].sourceId.startsWith(`${m.id}#`)).toBe(true);
  });

  it('a calculation changes nothing in the ledger', async () => {
    const before = await admin.stockMovement.count();
    await calc({ articleId, sizeIds: [sizeIds['150x300']] });
    expect(await admin.stockMovement.count()).toBe(before);
  });

  it('still works after the subscription has expired (it only reads)', async () => {
    await admin.subscription.update({ where: { orgId }, data: { expiresAt: new Date(Date.now() - 86_400_000) } });
    expect((await calc({ articleId, sizeIds: [sizeIds['150x300']] })).status).toBe(201);
  });

  it('an absurd quantity is rejected with 400 instead of freezing the server', async () => {
    const res = await calc({ articleId, sizeIds: [sizeIds['150x300']], quantities: [{ sizeId: sizeIds['150x300'], qty: 2_000_000 }] });
    expect(res.status).toBe(400);
  });
});

