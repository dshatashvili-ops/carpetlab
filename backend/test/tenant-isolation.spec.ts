import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../src/common/prisma.service';
import { runInTenant } from '../src/common/tenant-context';

const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_ADMIN_URL } } });
const prisma = new PrismaService();

describe('tenant isolation (RLS)', () => {
  let orgA: string; let orgB: string; let articleB: string;

  beforeAll(async () => {
    await admin.organization.deleteMany();
    orgA = (await admin.organization.create({ data: { name: 'A' } })).id;
    orgB = (await admin.organization.create({ data: { name: 'B' } })).id;
    await admin.article.create({ data: { orgId: orgA, code: '109029', name: 'A-art', rollWidthCm: 150, cutMode: 'LINEAR' } });
    articleB = (await admin.article.create({ data: { orgId: orgB, code: '109029', name: 'B-art', rollWidthCm: 150, cutMode: 'ANY' } })).id;
  });
  afterAll(async () => { await admin.$disconnect(); await prisma.$disconnect(); });

  it('findMany inside tenant A returns only A articles', async () => {
    const rows = await runInTenant(prisma, orgA, (tx) => tx.article.findMany());
    expect(rows.map((r) => r.name)).toEqual(['A-art']);
  });

  it('findUnique of an org B article id inside tenant A returns null', async () => {
    const row = await runInTenant(prisma, orgA, (tx) => tx.article.findUnique({ where: { id: articleB } }));
    expect(row).toBeNull();
  });

  it('inserting a row for another org is rejected by RLS', async () => {
    await expect(
      runInTenant(prisma, orgA, (tx) => tx.article.create({ data: { orgId: orgB, code: 'X', name: 'x', rollWidthCm: 150, cutMode: 'ANY' } })),
    ).rejects.toThrow();
  });

  it('queries without tenant context see nothing', async () => {
    expect(await prisma.article.findMany()).toEqual([]);
  });
});
