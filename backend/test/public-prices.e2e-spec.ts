import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { admin, createTestApp, resetDb } from './support/app';

describe('public prices', () => {
  let app: INestApplication;
  beforeEach(async () => { await resetDb(); ({ app } = await createTestApp()); });
  afterEach(async () => { await app.close(); });
  afterAll(async () => { await admin.$disconnect(); });

  it('GET /api/public/prices works without logging in and lists tariffs with their limits and prices', async () => {
    await admin.tariffPrice.create({ data: { plan: 1, months: 1, priceKopecks: 150_000 } });
    const res = await request(app.getHttpServer()).get('/api/public/prices');
    expect(res.status).toBe(200);
    expect(res.body.plans).toEqual([
      { plan: 1, articles: 10, employees: 3, photoMb: 100, prices: [{ months: 1, priceKopecks: 150_000 }] },
      { plan: 2, articles: 100, employees: 10, photoMb: 1024, prices: [] },
      { plan: 3, articles: 500, employees: 20, photoMb: 5120, prices: [] },
    ]);
  });
});
