import { INestApplication } from '@nestjs/common';
import pdfParse from 'pdf-parse';
import request from 'supertest';
import { addEmployee, admin, createTestApp, FakeMailer, registerOwner, resetDb } from './support/app';

const binary = (res: request.Response, done: (err: Error | null, body: Buffer) => void): void => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(c));
  res.on('end', () => done(null, Buffer.concat(chunks)));
};

describe('spec pdf', () => {
  let app: INestApplication; let mailer: FakeMailer; let owner: string[]; let docId: string;
  const api = () => request(app.getHttpServer());

  beforeEach(async () => {
    await resetDb(); ({ app, mailer } = await createTestApp()); owner = await registerOwner(app);
    const orgId = (await admin.organization.findFirstOrThrow()).id;
    const articleId = (await admin.article.create({ data: { orgId, code: '109029', name: 'Сахара', rollWidthCm: 150, cutMode: 'LINEAR' } })).id;
    const s200 = (await admin.sizeTemplate.create({ data: { orgId, widthCm: 150, lengthCm: 200 } })).id;
    await api().post('/api/stock/rolls').set('Cookie', owner).send({ articleId, widthCm: 150, lengthCm: 2500, count: 1 }).expect(201);
    docId = (await api().post('/api/cuts').set('Cookie', owner).send({ articleId, sizeIds: [s200], quantities: [{ sizeId: s200, qty: 5 }] })).body.id;
  });
  afterEach(async () => { await app.close(); });
  afterAll(async () => { await admin.$disconnect(); });

  const fetchPdf = (cookie = owner) => api().get(`/api/cuts/${docId}/spec.pdf`).set('Cookie', cookie).buffer(true).parse(binary);

  it('returns a PDF with the article, the size and the quantity (Cyrillic intact)', async () => {
    const res = await fetchPdf();
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    const buf = res.body as Buffer;
    expect(buf.subarray(0, 4).toString()).toBe('%PDF');
    const text = (await pdfParse(buf)).text;
    expect(text).toContain('109029');
    expect(text).toContain('150×200');
    expect(text).toContain('Спецификация');
    expect(text).toContain('5');
  });

  it('a CUTTER can download it', async () => {
    const cutter = await addEmployee(app, mailer, owner, 'cut@example.com', 'CUTTER');
    expect((await fetchPdf(cutter)).status).toBe(200);
  });

  it("another organization gets 404", async () => {
    const other = await registerOwner(app, 'other@example.com');
    expect((await fetchPdf(other)).status).toBe(404);
  });
});
