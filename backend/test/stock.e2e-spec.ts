import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { addEmployee, admin, createTestApp, FakeMailer, registerOwner, resetDb } from './support/app';

describe('stock ledger', () => {
  let app: INestApplication; let mailer: FakeMailer; let owner: string[]; let orgId: string; let articleId: string;
  const api = () => request(app.getHttpServer());
  const receive = (b: object = { articleId, widthCm: 150, lengthCm: 2500, count: 2 }) => api().post('/api/stock/rolls').set('Cookie', owner).send(b);
  const materials = async () => (await api().get(`/api/stock/materials?articleId=${articleId}`).set('Cookie', owner)).body;

  beforeEach(async () => {
    await resetDb(); ({ app, mailer } = await createTestApp()); owner = await registerOwner(app);
    orgId = (await admin.organization.findFirstOrThrow()).id;
    articleId = (await admin.article.create({ data: { orgId, code: '109029', name: 'Сахара', rollWidthCm: 150, cutMode: 'LINEAR' } })).id;
  });
  afterEach(async () => { await app.close(); });
  afterAll(async () => { await admin.$disconnect(); });

  it('receiving 2 rolls 150×2500 gives qty 2 and 75 m²', async () => {
    expect((await receive()).status).toBe(201);
    const rows = await materials();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ qty: 2, areaM2: 75, kind: 'ROLL', widthCm: 150, lengthCm: 2500 });
  });

  it('a second identical receipt adds to the same roll type', async () => {
    await receive(); await receive({ articleId, widthCm: 150, lengthCm: 2500, count: 1 });
    const rows = await materials();
    expect(rows).toHaveLength(1);
    expect(rows[0].qty).toBe(3);
  });

  it('a roll whose width differs from the article roll width is rejected (400)', async () => {
    expect((await receive({ articleId, widthCm: 160, lengthCm: 2500, count: 1 })).status).toBe(400);
  });

  it.each([0, -1, 1.5])('receipt count %p is rejected (400)', async (count) => {
    expect((await receive({ articleId, widthCm: 150, lengthCm: 2500, count })).status).toBe(400);
  });

  it('a manual write-off with a reason reduces the balance; history lists both operations with the author', async () => {
    await receive();
    const m = (await materials())[0];
    const adj = await api().post('/api/stock/adjust').set('Cookie', owner).send({ itemType: 'MATERIAL', id: m.id, qtyDelta: -1, reason: 'Брак ткани' });
    expect(adj.status).toBe(201);
    expect((await materials())[0].qty).toBe(1);
    const hist = await api().get(`/api/stock/history?itemId=${m.id}`).set('Cookie', owner);
    expect(hist.body.map((h: { kind: string }) => h.kind).sort()).toEqual(['MANUAL_WRITE_OFF', 'RECEIPT']);
    expect(hist.body[0].userEmail).toBe('owner@example.com');
  });

  it('a manual adjustment without a reason is rejected (400)', async () => {
    await receive();
    const m = (await materials())[0];
    const res = await api().post('/api/stock/adjust').set('Cookie', owner).send({ itemType: 'MATERIAL', id: m.id, qtyDelta: -1, reason: '  ' });
    expect(res.status).toBe(400);
  });

  it('writing off more than the balance is rejected (409) and changes nothing', async () => {
    await receive();
    const m = (await materials())[0];
    const res = await api().post('/api/stock/adjust').set('Cookie', owner).send({ itemType: 'MATERIAL', id: m.id, qtyDelta: -3, reason: 'ошибка' });
    expect(res.status).toBe(409);
    expect((await materials())[0].qty).toBe(2);
  });

  it('a CUTTER cannot adjust stock (403)', async () => {
    await receive();
    const m = (await materials())[0];
    const cutter = await addEmployee(app, mailer, owner, 'cut@example.com', 'CUTTER');
    const res = await api().post('/api/stock/adjust').set('Cookie', cutter).send({ itemType: 'MATERIAL', id: m.id, qtyDelta: -1, reason: 'x' });
    expect(res.status).toBe(403);
  });

  it("another organization's material is not found (404)", async () => {
    await receive();
    const m = (await materials())[0];
    const other = await registerOwner(app, 'other@example.com');
    const res = await api().post('/api/stock/adjust').set('Cookie', other).send({ itemType: 'MATERIAL', id: m.id, qtyDelta: -1, reason: 'x' });
    expect(res.status).toBe(404);
    expect((await materials())[0].qty).toBe(2);
  });

  it('a manual receipt of finished carpets shows up in the carpet balances', async () => {
    const size = await admin.sizeTemplate.create({ data: { orgId, widthCm: 150, lengthCm: 200 } });
    const sku = await admin.sku.create({ data: { orgId, articleId, sizeId: size.id } });
    const res = await api().post('/api/stock/adjust').set('Cookie', owner).send({ itemType: 'CARPET', id: sku.id, qtyDelta: 5, reason: 'Инвентаризация' });
    expect(res.status).toBe(201);
    const list = await api().get('/api/stock/carpets').set('Cookie', owner);
    expect(list.body).toEqual([expect.objectContaining({ skuId: sku.id, qty: 5, articleCode: '109029', widthCm: 150, lengthCm: 200 })]);
  });

  it('the article list can be filtered by stock: inStock / empty', async () => {
    await admin.article.create({ data: { orgId, code: '222', name: 'Пустой', rollWidthCm: 150, cutMode: 'ANY' } });
    await receive();
    const inStock = await api().get('/api/articles?stock=inStock').set('Cookie', owner);
    expect(inStock.body.map((a: { code: string }) => a.code)).toEqual(['109029']);
    const empty = await api().get('/api/articles?stock=empty').set('Cookie', owner);
    expect(empty.body.map((a: { code: string }) => a.code)).toEqual(['222']);
  });
});
