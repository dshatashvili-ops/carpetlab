import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ItemType } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { runInTenant } from '../common/tenant-context';
import { LedgerService } from './ledger.service';

const isPosInt = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0;

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService, private readonly ledger: LedgerService) {}

  async receiveRolls(orgId: string, userId: string, input: { articleId?: string; widthCm?: number; lengthCm?: number; count?: number }): Promise<{ materialId: string }> {
    const { articleId, widthCm, lengthCm, count } = input;
    if (!articleId) throw new BadRequestException('Укажите артикул');
    if (!isPosInt(widthCm) || !isPosInt(lengthCm)) throw new BadRequestException('Ширина и длина — целые сантиметры больше 0');
    if (!isPosInt(count)) throw new BadRequestException('Количество рулонов — целое число больше 0');
    return runInTenant(this.prisma, orgId, async (tx) => {
      const article = await tx.article.findUnique({ where: { id: articleId } });
      if (!article) throw new NotFoundException('Артикул не найден');
      if (article.rollWidthCm !== widthCm) throw new BadRequestException(`Ширина рулона этого артикула — ${article.rollWidthCm} см`);
      const existing = await tx.material.findFirst({ where: { articleId, widthCm, lengthCm, kind: 'ROLL' } });
      const material = existing ?? (await tx.material.create({ data: { orgId, articleId, widthCm, lengthCm, kind: 'ROLL' } }));
      await this.ledger.post(tx, [{ orgId, kind: 'RECEIPT', itemType: 'MATERIAL', materialId: material.id, qtyDelta: count, userId }]);
      return { materialId: material.id };
    });
  }

  async adjust(orgId: string, userId: string, input: { itemType?: ItemType; id?: string; qtyDelta?: number; reason?: string }): Promise<{ balance: number }> {
    const { itemType, id, qtyDelta } = input;
    const reason = (input.reason ?? '').trim();
    if (itemType !== 'MATERIAL' && itemType !== 'CARPET') throw new BadRequestException('Тип позиции: MATERIAL или CARPET');
    if (!id) throw new BadRequestException('Укажите позицию');
    if (!Number.isInteger(qtyDelta) || qtyDelta === 0) throw new BadRequestException('Изменение должно быть целым числом, не равным 0');
    if (!reason) throw new BadRequestException('Укажите причину');
    return runInTenant(this.prisma, orgId, async (tx) => {
      const exists = itemType === 'MATERIAL' ? await tx.material.findUnique({ where: { id } }) : await tx.sku.findUnique({ where: { id } });
      if (!exists) throw new NotFoundException('Позиция не найдена');
      await this.ledger.lock(tx, itemType, id);
      const current = await this.ledger.balanceOf(tx, itemType, id);
      if (current + (qtyDelta as number) < 0) throw new ConflictException(`Недостаточно остатка: на складе ${current}`);
      await this.ledger.post(tx, [{
        orgId, userId, reason, qtyDelta: qtyDelta as number, itemType,
        kind: (qtyDelta as number) < 0 ? 'MANUAL_WRITE_OFF' : 'MANUAL_RECEIPT',
        ...(itemType === 'MATERIAL' ? { materialId: id } : { skuId: id }),
      }]);
      return { balance: current + (qtyDelta as number) };
    });
  }

  async history(orgId: string, itemId: string) {
    const rows = await runInTenant(this.prisma, orgId, (tx) =>
      tx.stockMovement.findMany({ where: { OR: [{ materialId: itemId }, { skuId: itemId }] }, orderBy: { createdAt: 'asc' } }),
    );
    const users = await this.prisma.user.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.userId))] } }, select: { id: true, email: true } });
    const email = new Map(users.map((u) => [u.id, u.email]));
    return rows.map((r) => ({ id: r.id, kind: r.kind, qtyDelta: r.qtyDelta, reason: r.reason, documentId: r.documentId, userId: r.userId, userEmail: email.get(r.userId) ?? null, createdAt: r.createdAt }));
  }
}
