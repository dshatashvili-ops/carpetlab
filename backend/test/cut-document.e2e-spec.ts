import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { addEmployee, admin, createTestApp, FakeMailer, registerOwner, resetDb } from './support/app';

describe('cut documents: execute', () => {
  let app: INestApplication; let mailer: FakeMailer; let owner: string[]; let orgId: string; let articleId: string;
  const sz: Record<string, string> = {};
  const api = () => request(app.getHttpServer());
  const exec = (qty: Record<string, number>, cookie = owner, art = articleId) =>
    api().post('/api/cuts').set('Cookie', cookie).send({ articleId: art, sizeIds: Object.keys(qty).map((k) => sz[k]), quantities: Object.entries(qty).map(([k, v]) => ({ sizeId: sz[k], qty: v })) });
  const materials = async () => (await api().get(`/api/stock/materials?articleId=${articleId}`).set('Cookie', owner)).body as { id: string; kind: string; widthCm: number; lengthCm: number; qty: number }[];
  const carpets = async () => (await api().get('/api/stock/carpets').set('Cookie', owner)).body as { widthCm: number; lengthCm: number; qty: number }[];
  const roll = (count: number) => api().post('/api/stock/rolls').set('Cookie', owner).send({ articleId, widthCm: 150, lengthCm: 2500, count }).expect(201);

  beforeEach(async () => {
    await resetDb(); ({ app, mailer } = await createTestApp()); owner = await registerOwner(app);
    orgId = (await admin.organization.findFirstOrThrow()).id;
    articleId = (await admin.article.create({ data: { orgId, code: '109029', name: 'Сахара', rollWidthCm: 150, cutMode: 'LINEAR' } })).id;
    for (const l of [100, 150, 200, 300]) sz[`150x${l}`] = (await admin.sizeTemplate.create({ data: { orgId, widthCm: 150, lengthCm: l } })).id;
    await roll(1);
  });
  afterEach(async () => { await app.close(); });
  afterAll(async () => { await admin.$disconnect(); });

  it('executing 8×150×300 consumes the roll, creates a 150×100 remnant and 8 finished carpets', async () => {
    const res = await exec({ '150x300': 8 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ number: 1, version: 1, status: 'DONE' });
    const mats = await materials();
    expect(mats.map((m) => [m.kind, m.widthCm, m.lengthCm, m.qty])).toEqual([['REMNANT', 150, 100, 1]]);
    expect(await carpets()).toEqual([expect.objectContaining({ widthCm: 150, lengthCm: 300, qty: 8 })]);
    expect(await admin.stockMovement.count({ where: { documentId: res.body.id } })).toBeGreaterThanOrEqual(3);
  });

  it('document numbers are sequential per organization', async () => {
    await roll(1);
    expect((await exec({ '150x300': 1 })).body.number).toBe(1);
    expect((await exec({ '150x300': 1 })).body.number).toBe(2);
  });

  it('two rolls cut at once consume 2 units of the same roll type', async () => {
    await roll(1);
    const res = await exec({ '150x300': 16 });
    expect(res.status).toBe(201);
    expect((await materials()).map((m) => [m.kind, m.qty])).toEqual([['REMNANT', 2]]);
    expect((await carpets())[0].qty).toBe(16);
  });

  it('an infeasible request is 409 and leaves the ledger untouched', async () => {
    const before = await admin.stockMovement.count();
    const res = await exec({ '150x300': 9 });
    expect(res.status).toBe(409);
    expect(await admin.stockMovement.count()).toBe(before);
    expect(await admin.cutDocument.count()).toBe(0);
  });

  it('all-zero quantities are rejected (400)', async () => {
    expect((await exec({ '150x300': 0 })).status).toBe(400);
  });

  it('two simultaneous executions on one roll: exactly one succeeds and the roll never goes negative', async () => {
    const [a, b] = await Promise.all([exec({ '150x300': 8 }), exec({ '150x300': 8 })]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    const rollMaterial = await admin.material.findFirstOrThrow({ where: { kind: 'ROLL' } });
    const sum = await admin.stockMovement.aggregate({ _sum: { qtyDelta: true }, where: { materialId: rollMaterial.id } });
    expect(sum._sum.qtyDelta).toBe(0);
  });

  it('a CUTTER cannot execute a cut (403)', async () => {
    const cutter = await addEmployee(app, mailer, owner, 'cut@example.com', 'CUTTER');
    expect((await exec({ '150x300': 1 }, cutter)).status).toBe(403);
  });

  it("another organization's article is 404", async () => {
    const other = await registerOwner(app, 'other@example.com');
    expect((await exec({ '150x300': 1 }, other)).status).toBe(404);
  });

  it('an expired subscription blocks execution with 402', async () => {
    await admin.subscription.update({ where: { orgId }, data: { expiresAt: new Date(Date.now() - 86_400_000) } });
    expect((await exec({ '150x300': 1 })).status).toBe(402);
  });

  it('GET /api/cuts/:id returns lines with source and size, and GET /api/cuts lists the document', async () => {
    const created = await exec({ '150x300': 2, '150x200': 1 });
    const one = await api().get(`/api/cuts/${created.body.id}`).set('Cookie', owner);
    expect(one.status).toBe(200);
    expect(one.body.lines).toEqual(expect.arrayContaining([
      expect.objectContaining({ sizeWidthCm: 150, sizeLengthCm: 300, qty: 2, sourceKind: 'ROLL', sourceWidthCm: 150, sourceLengthCm: 2500 }),
      expect.objectContaining({ sizeWidthCm: 150, sizeLengthCm: 200, qty: 1 }),
    ]));
    const list = await api().get('/api/cuts').set('Cookie', owner);
    expect(list.body).toEqual([expect.objectContaining({ id: created.body.id, number: 1, articleCode: '109029' })]);
  });
});
