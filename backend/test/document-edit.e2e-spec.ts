import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { addEmployee, admin, createTestApp, FakeMailer, registerOwner, resetDb } from './support/app';

describe('cut documents: edit in place', () => {
  let app: INestApplication; let mailer: FakeMailer; let owner: string[]; let orgId: string; let articleId: string; let rollMaterialId: string;
  const sz: Record<string, string> = {};
  const api = () => request(app.getHttpServer());
  const exec = (qty: Record<string, number>) =>
    api().post('/api/cuts').set('Cookie', owner).send({ articleId, sizeIds: Object.keys(qty).map((k) => sz[k]), quantities: Object.entries(qty).map(([k, v]) => ({ sizeId: sz[k], qty: v })) });
  const edit = (id: string, body: object, cookie = owner) => api().patch(`/api/cuts/${id}`).set('Cookie', cookie).send(body);
  const carpets = async () => (await api().get('/api/stock/carpets').set('Cookie', owner)).body as { lengthCm: number; qty: number }[];
  const materials = async () => (await api().get(`/api/stock/materials?articleId=${articleId}`).set('Cookie', owner)).body as { id: string; kind: string; widthCm: number; lengthCm: number; qty: number }[];

  beforeEach(async () => {
    await resetDb(); ({ app, mailer } = await createTestApp()); owner = await registerOwner(app);
    orgId = (await admin.organization.findFirstOrThrow()).id;
    articleId = (await admin.article.create({ data: { orgId, code: '109029', name: 'Сахара', rollWidthCm: 150, cutMode: 'LINEAR' } })).id;
    for (const l of [200, 300, 1900]) sz[`150x${l}`] = (await admin.sizeTemplate.create({ data: { orgId, widthCm: 150, lengthCm: l } })).id;
    await api().post('/api/stock/rolls').set('Cookie', owner).send({ articleId, widthCm: 150, lengthCm: 2500, count: 1 }).expect(201);
    rollMaterialId = (await materials())[0].id;
  });
  afterEach(async () => { await app.close(); });
  afterAll(async () => { await admin.$disconnect(); });

  it('correcting 5 carpets to 4 updates the stock, bumps the version and records before/after with the author', async () => {
    const doc = (await exec({ '150x200': 5 })).body;
    expect((await carpets())[0].qty).toBe(5);
    const res = await edit(doc.id, { reason: 'Один ковер в брак', lines: [{ sourceMaterialId: rollMaterialId, sizeId: sz['150x200'], qty: 4 }] });
    expect(res.status).toBe(200);
    expect(res.body.version).toBe(2);
    expect(res.body.warnings).toEqual([]);
    expect((await carpets())[0].qty).toBe(4);
    const hist = await api().get(`/api/cuts/${doc.id}/history`).set('Cookie', owner);
    expect(hist.body).toHaveLength(1);
    expect(hist.body[0]).toMatchObject({ version: 2, reason: 'Один ковер в брак', editedByEmail: 'owner@example.com' });
    expect(hist.body[0].snapshot.before.outputs[0].qty).toBe(5);
    expect(hist.body[0].snapshot.after.outputs[0].qty).toBe(4);
  });

  it('an edit can also correct the leftovers: remnants and consumed material', async () => {
    const doc = (await exec({ '150x200': 5 })).body; // leaves a 150×1500 remnant
    await edit(doc.id, { reason: 'Обрезок меньше', lines: [{ sourceMaterialId: rollMaterialId, sizeId: sz['150x200'], qty: 5 }], remnants: [{ widthCm: 150, lengthCm: 1400, qty: 1 }] }).expect(200);
    const mats = await materials();
    expect(mats.map((m) => [m.kind, m.lengthCm, m.qty])).toEqual([['REMNANT', 1400, 1]]);
  });

  it('removing a remnant that a later document already used saves anyway but warns about that document', async () => {
    const doc1 = (await exec({ '150x300': 2 })).body; // leaves a 150×1900 remnant
    const doc2 = (await exec({ '150x1900': 1 })).body; // uses that remnant completely
    const res = await edit(doc1.id, { reason: 'Обрезка не было', lines: [{ sourceMaterialId: rollMaterialId, sizeId: sz['150x300'], qty: 2 }], remnants: [] });
    expect(res.status).toBe(200);
    expect(res.body.warnings).toEqual([expect.objectContaining({ itemType: 'MATERIAL', balance: -1, laterDocumentIds: [doc2.id] })]);
    const problems = await api().get('/api/stock/problems').set('Cookie', owner);
    expect(problems.body).toEqual([expect.objectContaining({ itemType: 'MATERIAL', balance: -1, widthCm: 150, lengthCm: 1900 })]);
  });

  it('the ledger nets out: consumed + reversal + new movements equal the edited state', async () => {
    const doc = (await exec({ '150x200': 5 })).body;
    await edit(doc.id, { reason: 'r', lines: [{ sourceMaterialId: rollMaterialId, sizeId: sz['150x200'], qty: 3 }] }).expect(200);
    await edit(doc.id, { reason: 'r2', lines: [{ sourceMaterialId: rollMaterialId, sizeId: sz['150x200'], qty: 6 }] }).expect(200);
    expect((await carpets())[0].qty).toBe(6);
    const rollSum = await admin.stockMovement.aggregate({ _sum: { qtyDelta: true }, where: { materialId: rollMaterialId } });
    expect(rollSum._sum.qtyDelta).toBe(0);
    expect((await api().get(`/api/cuts/${doc.id}`).set('Cookie', owner)).body.version).toBe(3);
  });

  it.each([-1, 1.5, '2'])('a line quantity of %p is rejected (400)', async (qty) => {
    const doc = (await exec({ '150x200': 5 })).body;
    expect((await edit(doc.id, { reason: 'r', lines: [{ sourceMaterialId: rollMaterialId, sizeId: sz['150x200'], qty }] })).status).toBe(400);
  });

  it('an edit without a reason is rejected (400)', async () => {
    const doc = (await exec({ '150x200': 5 })).body;
    expect((await edit(doc.id, { reason: ' ', lines: [{ sourceMaterialId: rollMaterialId, sizeId: sz['150x200'], qty: 4 }] })).status).toBe(400);
  });

  it('a CUTTER cannot edit (403) and another organization gets 404', async () => {
    const doc = (await exec({ '150x200': 5 })).body;
    const cutter = await addEmployee(app, mailer, owner, 'cut@example.com', 'CUTTER');
    const body = { reason: 'r', lines: [{ sourceMaterialId: rollMaterialId, sizeId: sz['150x200'], qty: 4 }] };
    expect((await edit(doc.id, body, cutter)).status).toBe(403);
    const other = await registerOwner(app, 'other@example.com');
    expect((await edit(doc.id, body, other)).status).toBe(404);
  });

  it('an expired subscription blocks edits with 402', async () => {
    const doc = (await exec({ '150x200': 5 })).body;
    await admin.subscription.update({ where: { orgId }, data: { expiresAt: new Date(Date.now() - 86_400_000) } });
    expect((await edit(doc.id, { reason: 'r', lines: [{ sourceMaterialId: rollMaterialId, sizeId: sz['150x200'], qty: 4 }] })).status).toBe(402);
  });
});
