import { INestApplication } from '@nestjs/common';
import pdfParse from 'pdf-parse';
import request from 'supertest';
import { BarcodesService } from '../src/barcodes/barcodes.service';
import { isValidEan13 } from '../src/barcodes/ean13';
import { PrismaService } from '../src/common/prisma.service';
import { runInTenant } from '../src/common/tenant-context';
import { addEmployee, admin, createTestApp, FakeMailer, registerOwner, resetDb } from './support/app';

describe('barcodes', () => {
  let app: INestApplication; let mailer: FakeMailer; let owner: string[]; let orgId: string; let articleId: string;
  const api = () => request(app.getHttpServer());
  const prefix = (p: string, cookie = owner) => api().put('/api/org/gs-prefix').set('Cookie', cookie).send({ prefix: p });
  const ensure = (sizeId: string, strict = true) =>
    runInTenant(app.get(PrismaService), orgId, (tx) => app.get(BarcodesService).ensureSku(tx, orgId, articleId, sizeId, { strict }));
  const newSize = async (l: number) => (await admin.sizeTemplate.create({ data: { orgId, widthCm: 150, lengthCm: l } })).id;

  beforeEach(async () => {
    await resetDb(); ({ app, mailer } = await createTestApp()); owner = await registerOwner(app);
    orgId = (await admin.organization.findFirstOrThrow()).id;
    articleId = (await admin.article.create({ data: { orgId, code: '109029', name: 'Сахара', rollWidthCm: 150, cutMode: 'LINEAR', barcodeEnabled: true } })).id;
  });
  afterEach(async () => { await app.close(); });
  afterAll(async () => { await admin.$disconnect(); });

  it('without a GS1 prefix, strict ensureSku fails with GS_PREFIX_REQUIRED', async () => {
    await expect(ensure(await newSize(200))).rejects.toMatchObject({ response: { code: 'GS_PREFIX_REQUIRED' } });
  });

  it('non-strict ensureSku creates the SKU without a code when there is no prefix', async () => {
    expect((await ensure(await newSize(200), false)).ean13).toBeNull();
  });

  it('with a prefix, each size gets its own valid EAN-13 and the same pair keeps its code', async () => {
    await prefix('4600123').expect(200);
    const s200 = await newSize(200); const s300 = await newSize(300);
    const a = await ensure(s200); const b = await ensure(s300); const again = await ensure(s200);
    expect(a.ean13).toMatch(/^4600123\d{6}$/);
    expect(isValidEan13(a.ean13!)).toBe(true);
    expect(b.ean13).not.toBe(a.ean13);
    expect(again.ean13).toBe(a.ean13);
  });

  it('an article without barcodeEnabled gets no code', async () => {
    await prefix('4600123').expect(200);
    await admin.article.update({ where: { id: articleId }, data: { barcodeEnabled: false } });
    expect((await ensure(await newSize(200))).ean13).toBeNull();
  });

  it('20 simultaneous assignments produce 20 distinct valid codes', async () => {
    await prefix('4600123').expect(200);
    const sizes = await Promise.all(Array.from({ length: 20 }, (_, i) => newSize(100 + i)));
    const skus = await Promise.all(sizes.map((s) => ensure(s)));
    const codes = skus.map((s) => s.ean13!);
    expect(new Set(codes).size).toBe(20);
    expect(codes.every(isValidEan13)).toBe(true);
  });

  it('prefix validation: 3 digits → 400; a CUTTER → 403; changing it after assignment → 409', async () => {
    expect((await prefix('123')).status).toBe(400);
    const cutter = await addEmployee(app, mailer, owner, 'cut@example.com', 'CUTTER');
    expect((await prefix('4600123', cutter)).status).toBe(403);
    await prefix('4600123').expect(200);
    await ensure(await newSize(200));
    expect((await prefix('4600999')).status).toBe(409);
    expect((await prefix('4600123')).status).toBe(200);
  });

  it('manual code: wrong check digit → 400, valid → 200, duplicate in the org → 409, already assigned → 409', async () => {
    const s1 = await newSize(200); const s2 = await newSize(300);
    const sku1 = await ensure(s1, false); const sku2 = await ensure(s2, false);
    const put = (id: string, ean13: string) => api().put(`/api/skus/${id}/barcode`).set('Cookie', owner).send({ ean13 });
    expect((await put(sku1.id, '4006381333932')).status).toBe(400);
    expect((await put(sku1.id, '4006381333931')).status).toBe(200);
    expect((await put(sku2.id, '4006381333931')).status).toBe(409);
    expect((await put(sku1.id, '5901234123457')).status).toBe(409);
  });

  it('a cut execution assigns codes to the finished carpets and the spec PDF shows them', async () => {
    await prefix('4600123').expect(200);
    const s200 = await newSize(200);
    await api().post('/api/stock/rolls').set('Cookie', owner).send({ articleId, widthCm: 150, lengthCm: 2500, count: 1 }).expect(201);
    const doc = (await api().post('/api/cuts').set('Cookie', owner).send({ articleId, sizeIds: [s200], quantities: [{ sizeId: s200, qty: 2 }] })).body;
    const detail = (await api().get(`/api/cuts/${doc.id}`).set('Cookie', owner)).body;
    expect(isValidEan13(detail.outputs[0].ean13)).toBe(true);
    const pdf = await api().get(`/api/cuts/${doc.id}/spec.pdf`).set('Cookie', owner).buffer(true).parse((res, done) => { const c: Buffer[] = []; res.on('data', (x: Buffer) => c.push(x)); res.on('end', () => done(null, Buffer.concat(c))); });
    expect((await pdfParse(pdf.body as Buffer)).text).toContain(detail.outputs[0].ean13);
  });

  it('a cut still succeeds when the article wants barcodes but no prefix is set (code stays empty)', async () => {
    const s200 = await newSize(200);
    await api().post('/api/stock/rolls').set('Cookie', owner).send({ articleId, widthCm: 150, lengthCm: 2500, count: 1 }).expect(201);
    const res = await api().post('/api/cuts').set('Cookie', owner).send({ articleId, sizeIds: [s200], quantities: [{ sizeId: s200, qty: 2 }] });
    expect(res.status).toBe(201);
    const detail = (await api().get(`/api/cuts/${res.body.id}`).set('Cookie', owner)).body;
    expect(detail.outputs[0].ean13).toBeNull();
  });

  it('org settings: read and update the remnant threshold and label size, with validation', async () => {
    const get = await api().get('/api/org/settings').set('Cookie', owner);
    expect(get.body).toMatchObject({ gsPrefix: null, minRemnantSideCm: 30, labelWidthMm: 58, labelHeightMm: 40 });
    const patch = await api().patch('/api/org/settings').set('Cookie', owner).send({ minRemnantSideCm: 20, labelWidthMm: 40, labelHeightMm: 30 });
    expect(patch.status).toBe(200);
    expect(patch.body).toMatchObject({ minRemnantSideCm: 20, labelWidthMm: 40, labelHeightMm: 30 });
    expect((await api().patch('/api/org/settings').set('Cookie', owner).send({ minRemnantSideCm: -1 })).status).toBe(400);
    expect((await api().patch('/api/org/settings').set('Cookie', owner).send({ labelWidthMm: 0 })).status).toBe(400);
  });
});
