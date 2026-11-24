import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CutMode } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { runInTenant } from '../common/tenant-context';
import { BalanceService, MaterialBalance } from '../stock/balance.service';
import { CutPlan, Request, Source, plan, suggestQuantities } from './engine';

export interface CalcInput { articleId?: string; sizeIds?: string[]; quantities?: { sizeId: string; qty: number }[] }
export interface Calculation {
  cutMode: CutMode;
  stock: { materials: MaterialBalance[] };
  requests: Request[];
  plan: CutPlan;
  sourceAreaM2: number; usedAreaM2: number; remnantAreaM2: number; wasteAreaM2: number;
}

/** One engine Source per physical roll/remnant: material id + '#' + unit number. */
export const sourceId = (materialId: string, n: number): string => `${materialId}#${n}`;
export const materialIdOf = (id: string): string => id.split('#')[0];
const m2 = (cm2: number): number => Math.round(cm2) / 10_000;

@Injectable()
export class CalculationService {
  constructor(private readonly prisma: PrismaService, private readonly balances: BalanceService) {}

  async calculate(orgId: string, input: CalcInput): Promise<Calculation> {
    const { articleId, sizeIds, quantities } = input;
    if (!articleId) throw new BadRequestException('Укажите артикул');
    if (!Array.isArray(sizeIds) || sizeIds.length === 0) throw new BadRequestException('Выберите хотя бы один размер');
    const unique = [...new Set(sizeIds)];
    if (quantities !== undefined) {
      if (!Array.isArray(quantities)) throw new BadRequestException('quantities должен быть массивом');
      for (const q of quantities) {
        if (!Number.isInteger(q?.qty) || q.qty < 0) throw new BadRequestException('Количество должно быть целым числом не меньше 0');
        if (!unique.includes(q.sizeId)) throw new BadRequestException('Количество задано для размера, который не выбран');
      }
    }

    const { article, sizes } = await runInTenant(this.prisma, orgId, async (tx) => {
      const article = await tx.article.findUnique({ where: { id: articleId } });
      if (!article) throw new NotFoundException('Артикул не найден');
      const sizes = await tx.sizeTemplate.findMany({ where: { id: { in: unique } } });
      if (sizes.length !== unique.length) throw new NotFoundException('Размер не найден');
      return { article, sizes };
    });
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    const materials = await this.balances.materials(orgId, articleId);
    const sources: Source[] = materials.flatMap((m) =>
      Array.from({ length: Math.max(0, m.qty) }, (_, n) => ({ id: sourceId(m.id, n), kind: m.kind, widthCm: m.widthCm, lengthCm: m.lengthCm })),
    );

    const byId = new Map(sizes.map((s) => [s.id, s]));
    const base = unique.map((id) => ({ sizeId: id, widthCm: byId.get(id)!.widthCm, lengthCm: byId.get(id)!.lengthCm }));
    let requests: Request[];
    if (quantities === undefined) {
      requests = suggestQuantities(sources, base, article.cutMode, org.minRemnantSideCm);
    } else {
      const qty = new Map(quantities.map((q) => [q.sizeId, q.qty]));
      requests = base.map((b) => ({ ...b, qty: qty.get(b.sizeId) ?? 0 }));
    }

    const result = plan(article.cutMode, sources, requests, org.minRemnantSideCm);
    const touched = new Set(result.placements.map((p) => p.sourceId));
    const sourceCm2 = sources.filter((s) => touched.has(s.id)).reduce((a, s) => a + s.widthCm * s.lengthCm, 0);
    const usedCm2 = result.placements.reduce((a, p) => a + p.widthCm * p.lengthCm, 0);
    const remnantCm2 = result.remnants.reduce((a, r) => a + r.widthCm * r.lengthCm, 0);
    return {
      cutMode: article.cutMode,
      stock: { materials },
      requests,
      plan: result,
      sourceAreaM2: m2(sourceCm2), usedAreaM2: m2(usedCm2), remnantAreaM2: m2(remnantCm2), wasteAreaM2: m2(sourceCm2 - usedCm2 - remnantCm2),
    };
  }
}
