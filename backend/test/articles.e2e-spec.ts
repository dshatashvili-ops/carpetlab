import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { addEmployee, admin, createTestApp, FakeMailer, registerOwner, resetDb } from './support/app';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const body = { code: '109029', name: 'Ковер Сахара', rollWidthCm: 150, cutMode: 'LINEAR' };

describe('articles', () => {
  let app: INestApplication; let mailer: FakeMailer; let owner: string[]; let orgId: string;
  const post = (cookie: string[], b: object = body) => request(app.getHttpServer()).post('/api/articles').set('Cookie', cookie).send(b);

  beforeEach(async () => {
    await resetDb(); ({ app, mailer } = await createTestApp()); owner = await registerOwner(app);
    orgId = (await admin.organization.findFirstOrThrow()).id;
  });
  afterEach(async () => { await app.close(); });
  afterAll(async () => { await admin.$disconnect(); });

  it('creates an article 109029 with a cut mode', async () => {
    const res = await post(owner);
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ code: '109029', rollWidthCm: 150, cutMode: 'LINEAR', barcodeEnabled: false });
  });

  it('a duplicate code is 409 inside an organization but allowed in another', async () => {
    await post(owner);
    expect((await post(owner)).status).toBe(409);
    const other = await registerOwner(app, 'other@example.com');
    expect((await post(other)).status).toBe(201);
  });

  it.each([0, -150, 1.5])('rollWidthCm %p is rejected with 400', async (w) => {
    expect((await post(owner, { ...body, rollWidthCm: w })).status).toBe(400);
  });

  it('a CUTTER cannot create articles (403)', async () => {
    const cutter = await addEmployee(app, mailer, owner, 'cut@example.com', 'CUTTER');
    expect((await post(cutter)).status).toBe(403);
  });

  it('the 11th article on plan 1 returns LIMIT_REACHED', async () => {
    for (let i = 0; i < 10; i++) await post(owner, { ...body, code: `C${i}` }).expect(201);
    const res = await post(owner, { ...body, code: 'C10' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('LIMIT_REACHED');
  });

  it('an article of another organization is invisible: 404, and absent from the list', async () => {
    const other = await registerOwner(app, 'other@example.com');
    const created = await post(other);
    const get = await request(app.getHttpServer()).get(`/api/articles/${created.body.id}`).set('Cookie', owner);
    expect(get.status).toBe(404);
    const patch = await request(app.getHttpServer()).patch(`/api/articles/${created.body.id}`).set('Cookie', owner).send({ name: 'x' });
    expect(patch.status).toBe(404);
    const list = await request(app.getHttpServer()).get('/api/articles').set('Cookie', owner);
    expect(list.body).toEqual([]);
  });

  it('an expired subscription makes POST /api/articles return 402 while GET works', async () => {
    await admin.subscription.update({ where: { orgId }, data: { expiresAt: new Date(Date.now() - 86_400_000) } });
    expect((await post(owner)).status).toBe(402);
    expect((await request(app.getHttpServer()).get('/api/articles').set('Cookie', owner)).status).toBe(200);
  });

  it('filters the list by code or name with ?q=', async () => {
    await post(owner); await post(owner, { ...body, code: '555', name: 'Другой' });
    const res = await request(app.getHttpServer()).get('/api/articles?q=1090').set('Cookie', owner);
    expect(res.body.map((a: { code: string }) => a.code)).toEqual(['109029']);
  });

  it('accepts a PNG photo and stores its size', async () => {
    const a = await post(owner);
    const res = await request(app.getHttpServer()).post(`/api/articles/${a.body.id}/photo`).set('Cookie', owner).attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(201);
    expect((await admin.article.findUniqueOrThrow({ where: { id: a.body.id } })).photoBytes).toBe(PNG.length);
  });

  it('rejects an executable uploaded as a photo (400)', async () => {
    const a = await post(owner);
    const res = await request(app.getHttpServer()).post(`/api/articles/${a.body.id}/photo`).set('Cookie', owner).attach('file', Buffer.from('MZ\x90\x00'), { filename: 'a.exe', contentType: 'application/x-msdownload' });
    expect(res.status).toBe(400);
  });

  it('rejects a file with a PNG content type but wrong bytes (400)', async () => {
    const a = await post(owner);
    const res = await request(app.getHttpServer()).post(`/api/articles/${a.body.id}/photo`).set('Cookie', owner).attach('file', Buffer.from('not an image at all'), { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
  });

  it('rejects a photo that exceeds the plan quota with QUOTA_REACHED', async () => {
    const a = await post(owner);
    await admin.article.update({ where: { id: a.body.id }, data: { photoBytes: 100 * 1024 * 1024 - 10 } });
    const b = await post(owner, { ...body, code: 'B1' });
    const res = await request(app.getHttpServer()).post(`/api/articles/${b.body.id}/photo`).set('Cookie', owner).attach('file', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('QUOTA_REACHED');
  });
});
