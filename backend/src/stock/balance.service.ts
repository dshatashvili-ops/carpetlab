import { Injectable } from '@nestjs/common';
import { MaterialKind } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { runInTenant } from '../common/tenant-context';

export interface MaterialBalance {
  id: string; articleId: string; kind: MaterialKind; widthCm: number; lengthCm: number; qty: number; areaM2: number;
}
export interface CarpetBalance {
  skuId: string; articleId: string; articleCode: string; articleName: string; sizeId: string;
  widthCm: number; lengthCm: number; ean13: string | null; qty: number;
}

const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;

@Injectable()
export class BalanceService {
  constructor(private readonly prisma: PrismaService) {}

  materials(orgId: string, articleId?: string): Promise<MaterialBalance[]> {
    return runInTenant(this.prisma, orgId, async (tx) => {
      const mats = await tx.material.findMany({ where: articleId ? { articleId } : {}, orderBy: [{ kind: 'asc' }, { createdAt: 'asc' }] });
      if (mats.length === 0) return [];
      const sums = await tx.stockMovement.groupBy({ by: ['materialId'], _sum: { qtyDelta: true }, where: { materialId: { in: mats.map((m) => m.id) } } });
      const qtyById = new Map(sums.map((s) => [s.materialId, s._sum.qtyDelta ?? 0]));
      return mats
        .map((m) => ({ m, qty: qtyById.get(m.id) ?? 0 }))
        .filter((r) => r.qty !== 0)
        .map(({ m, qty }) => ({
          id: m.id, articleId: m.articleId, kind: m.kind, widthCm: m.widthCm, lengthCm: m.lengthCm, qty,
          areaM2: round4((qty * m.widthCm * m.lengthCm) / 10_000),
        }));
    });
  }

  carpets(orgId: string, filter: { articleId?: string } = {}): Promise<CarpetBalance[]> {
    return runInTenant(this.prisma, orgId, async (tx) => {
      const skus = await tx.sku.findMany({ where: filter.articleId ? { articleId: filter.articleId } : {} });
      if (skus.length === 0) return [];
      const [sums, articles, sizes] = await Promise.all([
        tx.stockMovement.groupBy({ by: ['skuId'], _sum: { qtyDelta: true }, where: { skuId: { in: skus.map((s) => s.id) } } }),
        tx.article.findMany({ where: { id: { in: skus.map((s) => s.articleId) } } }),
        tx.sizeTemplate.findMany({ where: { id: { in: skus.map((s) => s.sizeId) } } }),
      ]);
      const qty = new Map(sums.map((s) => [s.skuId, s._sum.qtyDelta ?? 0]));
      const art = new Map(articles.map((a) => [a.id, a]));
      const size = new Map(sizes.map((s) => [s.id, s]));
      return skus
        .filter((s) => (qty.get(s.id) ?? 0) !== 0)
        .map((s) => ({
          skuId: s.id, articleId: s.articleId, articleCode: art.get(s.articleId)!.code, articleName: art.get(s.articleId)!.name,
          sizeId: s.sizeId, widthCm: size.get(s.sizeId)!.widthCm, lengthCm: size.get(s.sizeId)!.lengthCm, ean13: s.ean13, qty: qty.get(s.id) ?? 0,
        }));
    });
  }

  /** Ids of articles that have at least one roll or remnant in stock. */
  async articleIdsInStock(orgId: string): Promise<Set<string>> {
    const rows = await this.materials(orgId);
    return new Set(rows.filter((r) => r.qty > 0).map((r) => r.articleId));
  }
}
