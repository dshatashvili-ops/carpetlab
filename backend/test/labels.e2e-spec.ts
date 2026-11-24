import { INestApplication } from '@nestjs/common';
import pdfParse from 'pdf-parse';
import request from 'supertest';
import { BarcodesService } from '../src/barcodes/barcodes.service';
import { PrismaService } from '../src/common/prisma.service';
import { runInTenant } from '../src/common/tenant-context';
import { admin, createTestApp, registerOwner, resetDb } from './support/app';

const binary = (res: request.Response, done: (err: Error | null, body: Buffer) => void): void => {
  const c: Buffer[] = []; res.on('data', (x: Buffer) => c.push(x)); res.on('end', () => done(null, Buffer.concat(c)));
};

describe('carpet stock search and labels', () => {
  let app: INestApplication; let owner: string[]; let orgId: string; let articleId: string; let ean: string; let skuId: string; let plainSkuId: string;
  const api = () => request(app.getHttpServer());
  const label = (id: string, q = '', cookie = owner) => api().get(`/api/skus/${id}/label.pdf${q}`).set('Cookie', cookie).buffer(true).parse(binary);

  beforeEach(async () => {
    await resetDb(); ({ app } = await createTestApp()); owner = await registerOwner(app);
    orgId = (await admin.organization.findFirstOrThrow()).id; const userId = (await admin.user.findFirstOrThrow()).id;
    articleId = (await admin.article.create({ data: { orgId, code: '109029', name: 'Сахара', rollWidthCm: 150, cutMode: 'LINEAR', barcodeEnabled: true } })).id;
    const other = (await admin.article.create({ data: { orgId, code: '555', name: 'Без ШК', rollWidthCm: 150, cutMode: 'LINEAR' } })).id;
    const s200 = (await admin.sizeTemplate.create({ data: { orgId, widthCm: 150, lengthCm: 200 } })).id;
    await api().put('/api/org/gs-prefix').set('Cookie', owner).send({ prefix: '4600123' }).expect(200);
    const sku = await runInTenant(app.get(PrismaService), orgId, (tx) => app.get(BarcodesService).ensureSku(tx, orgId, articleId, s200));
    skuId = sku.id; ean = sku.ean13!;
    plainSkuId = (await admin.sku.create({ data: { orgId, articleId: other, sizeId: s200 } })).id;
    for (const id of [skuId, plainSkuId]) await admin.stockMovement.create({ data: { orgId, kind: 'MANUAL_RECEIPT', itemType: 'CARPET', skuId: id, qtyDelta: 3, reason: 'seed', userId } });
  });
  afterEach(async () => { await app.close(); });
  afterAll(async () => { await admin.$disconnect(); });

  it('finds finished carpets by the exact EAN-13', async () => {
    const res = await api().get(`/api/stock/carpets?ean=${ean}`).set('Cookie', owner);
    expect(res.body).toEqual([expect.objectContaining({ skuId, ean13: ean, articleCode: '109029', qty: 3 })]);
    expect((await api().get('/api/stock/carpets?ean=4006381333931').set('Cookie', owner)).body).toEqual([]);
  });

  it('finds carpets by article code or name with ?q=', async () => {
    const byCode = await api().get('/api/stock/carpets?q=1090').set('Cookie', owner);
    expect(byCode.body.map((c: { articleCode: string }) => c.articleCode)).toEqual(['109029']);
    const byName = await api().get('/api/stock/carpets?q=без').set('Cookie', owner);
    expect(byName.body.map((c: { articleCode: string }) => c.articleCode)).toEqual(['555']);
  });

  it('prints a label PDF with the code, article and size; copies=3 gives 3 pages', async () => {
    const res = await label(skuId, '?copies=3');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    const parsed = await pdfParse(res.body as Buffer);
    expect(parsed.numpages).toBe(3);
    expect(parsed.text).toContain(ean);
    expect(parsed.text).toContain('109029');
    expect(parsed.text).toContain('150×200');
  });

  it('uses the label size from the organization settings (40×30 mm)', async () => {
    await api().patch('/api/org/settings').set('Cookie', owner).send({ labelWidthMm: 40, labelHeightMm: 30 }).expect(200);
    const res = await label(skuId);
    const m = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec((res.body as Buffer).toString('latin1'))!;
    expect(Number(m[1])).toBeCloseTo(113.39, 0);
    expect(Number(m[2])).toBeCloseTo(85.04, 0);
  });

  it.each(['0', '-1', 'abc', '1.5', '201'])('copies=%s is rejected with 400', async (c) => {
    expect((await label(skuId, `?copies=${c}`)).status).toBe(400);
  });

  it('a SKU without a barcode returns 409', async () => {
    expect((await label(plainSkuId)).status).toBe(409);
  });

  it("another organization's SKU is 404", async () => {
    const other = await registerOwner(app, 'other@example.com');
    expect((await label(skuId, '', other)).status).toBe(404);
  });
});
