import { Injectable } from '@nestjs/common';
import { MaterialKind, Prisma } from '@prisma/client';
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

  carpets(orgId: string, filter: { articleId?: string; q?: string; ean?: string } = {}): Promise<CarpetBalance[]> {
    return runInTenant(this.prisma, orgId, async (tx) => {
      const where: Prisma.SkuWhereInput = {};
      if (filter.articleId) where.articleId = filter.articleId;
      if (filter.ean) where.ean13 = filter.ean;
      if (filter.q) where.articleId = { in: (await tx.article.findMany({ where: { OR: [{ code: { contains: filter.q, mode: 'insensitive' } }, { name: { contains: filter.q, mode: 'insensitive' } }] }, select: { id: true } })).map((a) => a.id) };
      const skus = await tx.sku.findMany({ where });
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

  /** Items whose balance went below zero (e.g. after an edit that conflicts with later documents). */
  problems(orgId: string): Promise<Record<string, unknown>[]> {
    return runInTenant(this.prisma, orgId, async (tx) => {
      const sums = await tx.stockMovement.groupBy({ by: ['materialId', 'skuId'], _sum: { qtyDelta: true } });
      const negative = sums.filter((s) => (s._sum.qtyDelta ?? 0) < 0);
      const out: Record<string, unknown>[] = [];
      for (const s of negative) {
        const where = s.materialId ? { materialId: s.materialId } : { skuId: s.skuId };
        const docs = await tx.stockMovement.findMany({ where: { ...where, documentId: { not: null } }, select: { documentId: true } });
        const documentIds = [...new Set(docs.map((d) => d.documentId!))];
        if (s.materialId) {
          const m = await tx.material.findUniqueOrThrow({ where: { id: s.materialId } });
          out.push({ itemType: 'MATERIAL', materialId: m.id, articleId: m.articleId, kind: m.kind, widthCm: m.widthCm, lengthCm: m.lengthCm, balance: s._sum.qtyDelta, documentIds });
        } else if (s.skuId) {
          const k = await tx.sku.findUniqueOrThrow({ where: { id: s.skuId } });
          const z = await tx.sizeTemplate.findUniqueOrThrow({ where: { id: k.sizeId } });
          out.push({ itemType: 'CARPET', skuId: k.id, articleId: k.articleId, widthCm: z.widthCm, lengthCm: z.lengthCm, balance: s._sum.qtyDelta, documentIds });
        }
      }
      return out;
    });
  }

  /** Ids of articles that have at least one roll or remnant in stock. */
  async articleIdsInStock(orgId: string): Promise<Set<string>> {
    const rows = await this.materials(orgId);
    return new Set(rows.filter((r) => r.qty > 0).map((r) => r.articleId));
  }
}
