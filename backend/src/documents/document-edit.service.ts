import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { CutDocument, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { runInTenant, Tx } from '../common/tenant-context';
import { LedgerService, NewMovement } from '../stock/ledger.service';
import { Actor } from './documents.service';

export interface DocState {
  lines: { sourceMaterialId: string; sizeId: string; qty: number }[];
  consumed: { materialId: string; qty: number }[];
  remnants: { materialId: string; widthCm: number; lengthCm: number; qty: number }[];
  outputs: { skuId: string; sizeId: string; widthCm: number; lengthCm: number; qty: number }[];
}
export interface EditInput {
  reason?: string;
  lines?: { sourceMaterialId: string; sizeId: string; qty: number }[];
  consumed?: { materialId: string; qty: number }[];
  remnants?: { widthCm: number; lengthCm: number; qty: number }[];
}
export interface ConflictWarning { itemType: 'MATERIAL' | 'CARPET'; materialId?: string; skuId?: string; balance: number; laterDocumentIds: string[] }

const isQty = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0;
const isDim = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0;

@Injectable()
export class DocumentEditService {
  constructor(private readonly prisma: PrismaService, private readonly ledger: LedgerService) {}

  async edit(actor: Actor, id: string, input: EditInput): Promise<{ id: string; number: number; version: number; status: string; articleId: string; warnings: ConflictWarning[] }> {
    const { orgId, userId } = actor;
    const reason = (input.reason ?? '').trim();
    if (!reason) throw new BadRequestException('Укажите причину правки');
    if (!Array.isArray(input.lines)) throw new BadRequestException('Передайте строки документа (lines)');
    for (const l of input.lines) {
      if (!l?.sourceMaterialId || !l?.sizeId || !isQty(l.qty)) throw new BadRequestException('Количество в строке — целое число не меньше 0');
    }
    for (const c of input.consumed ?? []) if (!c?.materialId || !isQty(c.qty)) throw new BadRequestException('Списанное количество — целое число не меньше 0');
    for (const r of input.remnants ?? []) if (!isDim(r?.widthCm) || !isDim(r?.lengthCm) || !isQty(r?.qty)) throw new BadRequestException('Обрезок: размеры > 0 и количество не меньше 0');

    return runInTenant(this.prisma, orgId, async (tx) => {
      const doc = await tx.cutDocument.findUnique({ where: { id } });
      if (!doc) throw new NotFoundException();
      if (doc.status !== 'DONE') throw new ConflictException('Документ отменен, правка невозможна');
      await tx.$queryRaw`SELECT id FROM "Material" WHERE "articleId" = ${doc.articleId}::uuid FOR UPDATE`;

      const materials = await tx.material.findMany({ where: { articleId: doc.articleId } });
      const known = new Set(materials.map((m) => m.id));
      for (const l of input.lines!) if (!known.has(l.sourceMaterialId)) throw new BadRequestException('Источник не относится к артикулу документа');
      for (const c of input.consumed ?? []) if (!known.has(c.materialId)) throw new BadRequestException('Списанный материал не относится к артикулу документа');
      const sizeIds = [...new Set(input.lines!.map((l) => l.sizeId))];
      const sizes = await tx.sizeTemplate.findMany({ where: { id: { in: sizeIds } } });
      if (sizes.length !== sizeIds.length) throw new BadRequestException('Размер не найден');

      const before = await this.currentState(tx, doc);
      const after = await this.buildState(tx, doc, input, before, sizes);

      const delta = new Map<string, { itemType: 'MATERIAL' | 'CARPET'; materialId?: string; skuId?: string; qty: number }>();
      const add = (key: string, itemType: 'MATERIAL' | 'CARPET', ids: { materialId?: string; skuId?: string }, qty: number): void => {
        const cur = delta.get(key) ?? { itemType, ...ids, qty: 0 };
        cur.qty += qty;
        delta.set(key, cur);
      };
      for (const [state, sign] of [[after, 1], [before, -1]] as const) {
        state.consumed.forEach((c) => add(`M:${c.materialId}`, 'MATERIAL', { materialId: c.materialId }, -c.qty * sign));
        state.remnants.forEach((r) => add(`M:${r.materialId}`, 'MATERIAL', { materialId: r.materialId }, r.qty * sign));
        state.outputs.forEach((o) => add(`C:${o.skuId}`, 'CARPET', { skuId: o.skuId }, o.qty * sign));
      }
      const movements: NewMovement[] = [...delta.values()].filter((d) => d.qty !== 0).map((d) => ({
        orgId, userId, reason, documentId: id, kind: 'EDIT_REVERSAL', itemType: d.itemType, materialId: d.materialId, skuId: d.skuId, qtyDelta: d.qty,
      }));
      await this.ledger.post(tx, movements);

      await tx.cutDocumentLine.deleteMany({ where: { documentId: id } });
      const keep = after.lines.filter((l) => l.qty > 0);
      if (keep.length) await tx.cutDocumentLine.createMany({ data: keep.map((l) => ({ orgId, documentId: id, ...l })) });
      const version = doc.version + 1;
      await tx.cutDocument.update({ where: { id }, data: { version } });
      await tx.cutDocumentVersion.create({ data: { orgId, documentId: id, version, editedBy: userId, reason, snapshot: { before, after } as unknown as Prisma.InputJsonValue } });

      const warnings = await this.conflicts(tx, doc, [...delta.values()].filter((d) => d.qty !== 0));
      return { id, number: doc.number, version, status: doc.status, articleId: doc.articleId, warnings };
    });
  }

  async history(orgId: string, id: string) {
    const rows = await runInTenant(this.prisma, orgId, async (tx) => {
      if (!(await tx.cutDocument.findUnique({ where: { id } }))) throw new NotFoundException();
      return tx.cutDocumentVersion.findMany({ where: { documentId: id }, orderBy: { version: 'asc' } });
    });
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.editedBy))] } }, select: { id: true, email: true } });
    return rows.map((r) => ({ version: r.version, reason: r.reason, createdAt: r.createdAt, editedBy: r.editedBy, editedByEmail: users.find((u) => u.id === r.editedBy)?.email ?? null, snapshot: r.snapshot }));
  }

  /** Version 1 is derived from the original movements; later versions from the `after` of the newest history row. */
  private async currentState(tx: Tx, doc: CutDocument): Promise<DocState> {
    if (doc.version > 1) {
      const last = await tx.cutDocumentVersion.findFirstOrThrow({ where: { documentId: doc.id }, orderBy: { version: 'desc' } });
      return (last.snapshot as unknown as { after: DocState }).after;
    }
    const [lines, moves] = await Promise.all([tx.cutDocumentLine.findMany({ where: { documentId: doc.id } }), tx.stockMovement.findMany({ where: { documentId: doc.id } })]);
    const mats = await tx.material.findMany({ where: { id: { in: moves.filter((m) => m.materialId).map((m) => m.materialId!) } } });
    const skus = await tx.sku.findMany({ where: { id: { in: moves.filter((m) => m.skuId).map((m) => m.skuId!) } } });
    const sizes = await tx.sizeTemplate.findMany({ where: { id: { in: skus.map((s) => s.sizeId) } } });
    return {
      lines: lines.map((l) => ({ sourceMaterialId: l.sourceMaterialId, sizeId: l.sizeId, qty: l.qty })),
      consumed: moves.filter((m) => m.kind === 'CUT_CONSUME').map((m) => ({ materialId: m.materialId!, qty: -m.qtyDelta })),
      remnants: moves.filter((m) => m.kind === 'RECEIPT').map((m) => { const x = mats.find((y) => y.id === m.materialId)!; return { materialId: x.id, widthCm: x.widthCm, lengthCm: x.lengthCm, qty: m.qtyDelta }; }),
      outputs: moves.filter((m) => m.kind === 'CUT_OUTPUT').map((m) => { const s = skus.find((y) => y.id === m.skuId)!; const z = sizes.find((y) => y.id === s.sizeId)!; return { skuId: s.id, sizeId: s.sizeId, widthCm: z.widthCm, lengthCm: z.lengthCm, qty: m.qtyDelta }; }),
    };
  }

  private async buildState(tx: Tx, doc: CutDocument, input: EditInput, before: DocState, sizes: { id: string; widthCm: number; lengthCm: number }[]): Promise<DocState> {
    const lines = input.lines!.filter((l) => l.qty > 0).map((l) => ({ sourceMaterialId: l.sourceMaterialId, sizeId: l.sizeId, qty: l.qty }));
    const perSize = new Map<string, number>();
    lines.forEach((l) => perSize.set(l.sizeId, (perSize.get(l.sizeId) ?? 0) + l.qty));
    const outputs: DocState['outputs'] = [];
    for (const [sizeId, qty] of perSize) {
      const size = sizes.find((s) => s.id === sizeId)!;
      const sku = (await tx.sku.findUnique({ where: { articleId_sizeId: { articleId: doc.articleId, sizeId } } })) ?? (await tx.sku.create({ data: { orgId: doc.orgId, articleId: doc.articleId, sizeId } }));
      outputs.push({ skuId: sku.id, sizeId, widthCm: size.widthCm, lengthCm: size.lengthCm, qty });
    }
    const consumed = input.consumed ? input.consumed.filter((c) => c.qty > 0).map((c) => ({ materialId: c.materialId, qty: c.qty })) : before.consumed;
    let remnants = before.remnants;
    if (input.remnants) {
      remnants = [];
      for (const r of input.remnants.filter((x) => x.qty > 0)) {
        const mat = (await tx.material.findFirst({ where: { articleId: doc.articleId, widthCm: r.widthCm, lengthCm: r.lengthCm, kind: 'REMNANT' } })) ?? (await tx.material.create({ data: { orgId: doc.orgId, articleId: doc.articleId, widthCm: r.widthCm, lengthCm: r.lengthCm, kind: 'REMNANT' } }));
        remnants.push({ materialId: mat.id, widthCm: r.widthCm, lengthCm: r.lengthCm, qty: r.qty });
      }
    }
    return { lines, consumed, remnants, outputs };
  }

  private async conflicts(tx: Tx, doc: CutDocument, touched: { itemType: 'MATERIAL' | 'CARPET'; materialId?: string; skuId?: string }[]): Promise<ConflictWarning[]> {
    const out: ConflictWarning[] = [];
    for (const t of touched) {
      const where = t.itemType === 'MATERIAL' ? { materialId: t.materialId } : { skuId: t.skuId };
      const sum = await tx.stockMovement.aggregate({ _sum: { qtyDelta: true }, where });
      const balance = sum._sum.qtyDelta ?? 0;
      if (balance >= 0) continue;
      const others = await tx.stockMovement.findMany({ where: { ...where, documentId: { not: doc.id, notIn: [] } }, select: { documentId: true } });
      const ids = [...new Set(others.map((o) => o.documentId).filter((d): d is string => !!d))];
      const later = await tx.cutDocument.findMany({ where: { id: { in: ids }, number: { gt: doc.number } }, select: { id: true } });
      out.push({ ...t, balance, laterDocumentIds: later.map((d) => d.id) });
    }
    return out;
  }
}
