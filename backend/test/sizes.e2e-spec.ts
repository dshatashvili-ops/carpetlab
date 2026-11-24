import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { admin, createTestApp, registerOwner, resetDb } from './support/app';

describe('size templates', () => {
  let app: INestApplication; let owner: string[]; let orgId: string;
  const post = (b: object) => request(app.getHttpServer()).post('/api/sizes').set('Cookie', owner).send(b);

  beforeEach(async () => { await resetDb(); ({ app } = await createTestApp()); owner = await registerOwner(app); orgId = (await admin.organization.findFirstOrThrow()).id; });
  afterEach(async () => { await app.close(); });
  afterAll(async () => { await admin.$disconnect(); });

  it('creates a 150×200 template and lists it', async () => {
    const res = await post({ widthCm: 150, lengthCm: 200 });
    expect(res.status).toBe(201);
    const list = await request(app.getHttpServer()).get('/api/sizes').set('Cookie', owner);
    expect(list.body.map((s: { widthCm: number; lengthCm: number }) => [s.widthCm, s.lengthCm])).toEqual([[150, 200]]);
  });

  it('a duplicate size returns 409', async () => {
    await post({ widthCm: 150, lengthCm: 200 });
    expect((await post({ widthCm: 150, lengthCm: 200 })).status).toBe(409);
  });

  it.each([[0, 100], [100, 0], [-1, 100], [1.5, 100]])('size %p×%p is rejected with 400', async (w, l) => {
    expect((await post({ widthCm: w, lengthCm: l })).status).toBe(400);
  });

  it('deleting a size used by a carpet SKU returns 409', async () => {
    const size = (await post({ widthCm: 150, lengthCm: 200 })).body;
    const article = await admin.article.create({ data: { orgId, code: '1', name: 'a', rollWidthCm: 150, cutMode: 'LINEAR' } });
    await admin.sku.create({ data: { orgId, articleId: article.id, sizeId: size.id } });
    expect((await request(app.getHttpServer()).delete(`/api/sizes/${size.id}`).set('Cookie', owner)).status).toBe(409);
  });

  it('deleting an unused size returns 204', async () => {
    const size = (await post({ widthCm: 150, lengthCm: 300 })).body;
    expect((await request(app.getHttpServer()).delete(`/api/sizes/${size.id}`).set('Cookie', owner)).status).toBe(204);
  });
});
