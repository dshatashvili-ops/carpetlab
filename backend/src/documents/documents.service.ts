import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BarcodesService } from '../barcodes/barcodes.service';
import { PrismaService } from '../common/prisma.service';
import { runInTenant, Tx } from '../common/tenant-context';
import { CalcInput, CalculationService, materialIdOf } from '../cutting/calculation.service';
import { LedgerService, NewMovement } from '../stock/ledger.service';

export interface Actor { orgId: string; userId: string }

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService, private readonly calc: CalculationService, private readonly ledger: LedgerService, private readonly barcodes: BarcodesService) {}

  async execute(actor: Actor, input: CalcInput): Promise<{ id: string; number: number; version: number; status: string; articleId: string }> {
    const { orgId, userId } = actor;
    try {
      return await runInTenant(this.prisma, orgId, async (tx) => {
        if (!input.articleId) throw new BadRequestException('Укажите артикул');
        // Serialize executions per article: whoever gets the lock first sees the stock the next one will calculate against.
        await tx.$queryRaw`SELECT id FROM "Material" WHERE "articleId" = ${input.articleId}::uuid FOR UPDATE`;
        const calc = await this.calc.calculate(orgId, input);
        if (calc.requests.every((r) => r.qty === 0)) throw new BadRequestException('Нечего резать: все количества равны 0');
        if (!calc.plan.feasible) throw new ConflictException({ code: 'CUT_INFEASIBLE', message: 'Материала не хватает', shortfall: calc.plan.shortfall });
        const articleId = input.articleId;

        const [{ number }] = await tx.$queryRaw<{ number: number }[]>`
          INSERT INTO "DocCounter" (id, "orgId", next) VALUES (gen_random_uuid(), ${orgId}::uuid, 2)
          ON CONFLICT ("orgId") DO UPDATE SET next = "DocCounter".next + 1
          RETURNING next - 1 AS number`;
        const doc = await tx.cutDocument.create({ data: { orgId, number, articleId, createdBy: userId } });

        const lineQty = new Map<string, number>();
        const unitsByMaterial = new Map<string, Set<string>>();
        const outputBySize = new Map<string, number>();
        for (const p of calc.plan.placements) {
          const mid = materialIdOf(p.sourceId);
          lineQty.set(`${mid}|${p.sizeId}`, (lineQty.get(`${mid}|${p.sizeId}`) ?? 0) + 1);
          if (!unitsByMaterial.has(mid)) unitsByMaterial.set(mid, new Set());
          unitsByMaterial.get(mid)!.add(p.sourceId);
          outputBySize.set(p.sizeId, (outputBySize.get(p.sizeId) ?? 0) + 1);
        }
        await tx.cutDocumentLine.createMany({
          data: [...lineQty].map(([key, qty]) => { const [sourceMaterialId, sizeId] = key.split('|'); return { orgId, documentId: doc.id, sourceMaterialId, sizeId, qty }; }),
        });

        const movements: NewMovement[] = [];
        for (const [mid, units] of unitsByMaterial) {
          movements.push({ orgId, userId, documentId: doc.id, kind: 'CUT_CONSUME', itemType: 'MATERIAL', materialId: mid, qtyDelta: -units.size });
        }
        const remnantCount = new Map<string, number>();
        for (const r of calc.plan.remnants) remnantCount.set(`${r.widthCm}x${r.lengthCm}`, (remnantCount.get(`${r.widthCm}x${r.lengthCm}`) ?? 0) + 1);
        for (const [dims, count] of remnantCount) {
          const [widthCm, lengthCm] = dims.split('x').map(Number);
          const material = await this.findOrCreateRemnant(tx, orgId, articleId, widthCm, lengthCm);
          movements.push({ orgId, userId, documentId: doc.id, kind: 'RECEIPT', itemType: 'MATERIAL', materialId: material.id, qtyDelta: count });
        }
        for (const [sizeId, qty] of outputBySize) {
          const sku = await this.barcodes.ensureSku(tx, orgId, articleId, sizeId, { strict: false });
          movements.push({ orgId, userId, documentId: doc.id, kind: 'CUT_OUTPUT', itemType: 'CARPET', skuId: sku.id, qtyDelta: qty });
        }
        await this.ledger.post(tx, movements);
        return { id: doc.id, number: doc.number, version: doc.version, status: doc.status, articleId };
      });
    } catch (e) {
      if (e instanceof RangeError) throw new BadRequestException(e.message);
      throw e;
    }
  }

  private async findOrCreateRemnant(tx: Tx, orgId: string, articleId: string, widthCm: number, lengthCm: number) {
    return (
      (await tx.material.findFirst({ where: { articleId, widthCm, lengthCm, kind: 'REMNANT' } })) ??
      (await tx.material.create({ data: { orgId, articleId, widthCm, lengthCm, kind: 'REMNANT' } }))
    );
  }

  async list(orgId: string) {
    const docs = await runInTenant(this.prisma, orgId, async (tx) => {
      const rows = await tx.cutDocument.findMany({ orderBy: { number: 'desc' } });
      const articles = await tx.article.findMany({ where: { id: { in: rows.map((d) => d.articleId) } } });
      return rows.map((d) => ({ d, article: articles.find((a) => a.id === d.articleId)! }));
    });
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(docs.map((x) => x.d.createdBy))] } }, select: { id: true, email: true } });
    return docs.map(({ d, article }) => ({
      id: d.id, number: d.number, status: d.status, version: d.version, articleId: d.articleId, articleCode: article.code, articleName: article.name,
      createdAt: d.createdAt, createdByEmail: users.find((u) => u.id === d.createdBy)?.email ?? null,
    }));
  }

  async get(orgId: string, id: string) {
    const data = await runInTenant(this.prisma, orgId, async (tx) => {
      const d = await tx.cutDocument.findUnique({ where: { id } });
      if (!d) throw new NotFoundException();
      const [article, lines] = await Promise.all([tx.article.findUniqueOrThrow({ where: { id: d.articleId } }), tx.cutDocumentLine.findMany({ where: { documentId: id } })]);
      const [sizes, mats, moves] = await Promise.all([
        tx.sizeTemplate.findMany({ where: { id: { in: lines.map((l) => l.sizeId) } } }),
        tx.material.findMany({ where: { articleId: d.articleId } }),
        tx.stockMovement.findMany({ where: { documentId: id } }),
      ]);
      // After an edit the movements are netted deltas, so the current outputs/remnants live in the newest history snapshot.
      const last = d.version > 1 ? await tx.cutDocumentVersion.findFirst({ where: { documentId: id }, orderBy: { version: 'desc' } }) : null;
      const state = last ? (last.snapshot as unknown as { after: { outputs: { skuId: string; sizeId: string; widthCm: number; lengthCm: number; qty: number }[]; remnants: { materialId: string; widthCm: number; lengthCm: number; qty: number }[] } }).after : null;
      const skuIds = [...moves.filter((m) => m.skuId).map((m) => m.skuId!), ...(state?.outputs.map((o) => o.skuId) ?? [])];
      const skus = await tx.sku.findMany({ where: { id: { in: skuIds } } });
      const skuSizes = await tx.sizeTemplate.findMany({ where: { id: { in: skus.map((s) => s.sizeId) } } });
      return { d, article, lines, sizes, mats, moves, skus, skuSizes, state };
    });
    const { d, article, lines, sizes, mats, moves, skus, skuSizes, state } = data;
    return {
      id: d.id, number: d.number, status: d.status, version: d.version, articleId: d.articleId, articleCode: article.code, articleName: article.name, createdAt: d.createdAt,
      lines: lines.map((l) => {
        const size = sizes.find((s) => s.id === l.sizeId)!; const src = mats.find((m) => m.id === l.sourceMaterialId)!;
        return { sourceMaterialId: l.sourceMaterialId, sourceKind: src.kind, sourceWidthCm: src.widthCm, sourceLengthCm: src.lengthCm, sizeId: l.sizeId, sizeWidthCm: size.widthCm, sizeLengthCm: size.lengthCm, qty: l.qty };
      }),
      outputs: state ? state.outputs.map((o) => ({ skuId: o.skuId, ean13: skus.find((k) => k.id === o.skuId)?.ean13 ?? null, widthCm: o.widthCm, lengthCm: o.lengthCm, qty: o.qty })) : moves.filter((m) => m.kind === 'CUT_OUTPUT').map((m) => {
        const sku = skus.find((s) => s.id === m.skuId)!; const size = skuSizes.find((s) => s.id === sku.sizeId)!;
        return { skuId: sku.id, ean13: sku.ean13, widthCm: size.widthCm, lengthCm: size.lengthCm, qty: m.qtyDelta };
      }),
      remnants: state ? state.remnants : moves.filter((m) => m.kind === 'RECEIPT').map((m) => {
        const mat = mats.find((x) => x.id === m.materialId)!;
        return { materialId: mat.id, widthCm: mat.widthCm, lengthCm: mat.lengthCm, qty: m.qtyDelta };
      }),
    };
  }
}
