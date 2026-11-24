import { Injectable } from '@nestjs/common';
import { ItemType, MovementKind } from '@prisma/client';
import { Tx } from '../common/tenant-context';

export interface NewMovement {
  orgId: string; kind: MovementKind; itemType: ItemType; materialId?: string; skuId?: string;
  qtyDelta: number; documentId?: string; reason?: string; userId: string;
}

@Injectable()
export class LedgerService {
  /** Appends movements to the journal. Balances are always the SUM of qtyDelta; nothing is updated in place. */
  async post(tx: Tx, movements: NewMovement[]): Promise<void> {
    if (movements.length === 0) return;
    await tx.stockMovement.createMany({ data: movements });
  }

  async balanceOf(tx: Tx, itemType: ItemType, id: string): Promise<number> {
    const agg = await tx.stockMovement.aggregate({
      _sum: { qtyDelta: true },
      where: itemType === 'MATERIAL' ? { materialId: id } : { skuId: id },
    });
    return agg._sum.qtyDelta ?? 0;
  }

  /** Serializes concurrent changes to one item (row lock held until the transaction ends). */
  async lock(tx: Tx, itemType: ItemType, id: string): Promise<void> {
    if (itemType === 'MATERIAL') await tx.$queryRaw`SELECT id FROM "Material" WHERE id = ${id}::uuid FOR UPDATE`;
    else await tx.$queryRaw`SELECT id FROM "Sku" WHERE id = ${id}::uuid FOR UPDATE`;
  }
}
