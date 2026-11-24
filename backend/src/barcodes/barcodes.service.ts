import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Sku } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { runInTenant, Tx } from '../common/tenant-context';
import { formatEan13, isValidEan13 } from './ean13';

@Injectable()
export class BarcodesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns the SKU of (article, size), creating it if needed, and gives it a permanent EAN-13 when the article uses barcodes.
   * strict=false never fails for a missing GS1 prefix: the SKU is returned without a code.
   */
  async ensureSku(tx: Tx, orgId: string, articleId: string, sizeId: string, opts: { strict?: boolean } = {}): Promise<Sku> {
    const strict = opts.strict ?? true;
    const sku = (await tx.sku.findUnique({ where: { articleId_sizeId: { articleId, sizeId } } })) ?? (await tx.sku.create({ data: { orgId, articleId, sizeId } }));
    if (sku.ean13) return sku;
    const article = await tx.article.findUniqueOrThrow({ where: { id: articleId } });
    if (!article.barcodeEnabled) return sku;
    return this.assign(tx, orgId, sku, strict);
  }

  /** Gives an existing SKU its next number from the organization's sequence (idempotent when it already has one). */
  async assign(tx: Tx, orgId: string, sku: Sku, strict: boolean): Promise<Sku> {
    if (sku.ean13) return sku;
    const org = await tx.organization.findUniqueOrThrow({ where: { id: orgId } });
    if (!org.gsPrefix) {
      if (strict) throw new ConflictException({ code: 'GS_PREFIX_REQUIRED', message: 'Укажите префикс GS1 в настройках организации' });
      return sku;
    }
    await tx.$executeRaw`INSERT INTO "BarcodeSequence" (id, "orgId", "nextNumber") VALUES (gen_random_uuid(), ${orgId}::uuid, 1) ON CONFLICT ("orgId") DO NOTHING`;
    await tx.$queryRaw`SELECT id FROM "BarcodeSequence" WHERE "orgId" = ${orgId}::uuid FOR UPDATE`;
    const seq = await tx.barcodeSequence.findUniqueOrThrow({ where: { orgId } });
    let n = seq.nextNumber;
    for (;;) {
      let code: string;
      try { code = formatEan13(org.gsPrefix, n); }
      catch { throw new ConflictException({ code: 'BARCODE_RANGE_EXHAUSTED', message: 'Номера для этого префикса GS1 закончились' }); }
      const taken = await tx.sku.findFirst({ where: { orgId, ean13: code }, select: { id: true } });
      if (!taken) {
        await tx.barcodeSequence.update({ where: { orgId }, data: { nextNumber: n + 1 } });
        return tx.sku.update({ where: { id: sku.id }, data: { ean13: code } });
      }
      n += 1;
    }
  }

  async assignExisting(orgId: string, skuId: string): Promise<Sku> {
    return runInTenant(this.prisma, orgId, async (tx) => {
      const sku = await tx.sku.findUnique({ where: { id: skuId } });
      if (!sku) throw new NotFoundException();
      return this.assign(tx, orgId, sku, true);
    });
  }

  async setManual(orgId: string, skuId: string, ean13: string): Promise<Sku> {
    if (!isValidEan13(ean13 ?? '')) throw new BadRequestException('Некорректный EAN-13: проверьте цифры и контрольную цифру');
    return runInTenant(this.prisma, orgId, async (tx) => {
      const sku = await tx.sku.findUnique({ where: { id: skuId } });
      if (!sku) throw new NotFoundException();
      if (sku.ean13) throw new ConflictException('Штрихкод уже присвоен и не меняется');
      if (await tx.sku.findFirst({ where: { orgId, ean13 }, select: { id: true } })) throw new ConflictException('Такой штрихкод уже используется');
      return tx.sku.update({ where: { id: skuId }, data: { ean13 } });
    });
  }

  async setPrefix(orgId: string, prefix: string): Promise<{ gsPrefix: string }> {
    if (!/^\d{7,9}$/.test(prefix ?? '')) throw new BadRequestException('Префикс GS1 — от 7 до 9 цифр');
    const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    if (org.gsPrefix && org.gsPrefix !== prefix) {
      const seq = await runInTenant(this.prisma, orgId, (tx) => tx.barcodeSequence.findUnique({ where: { orgId } }));
      if (seq && seq.nextNumber > 1) throw new ConflictException('Префикс нельзя менять после присвоения штрихкодов');
    }
    await this.prisma.organization.update({ where: { id: orgId }, data: { gsPrefix: prefix } });
    return { gsPrefix: prefix };
  }
}
