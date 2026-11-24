import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Article, CutMode, Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import { ObjectStorage } from '../common/storage';
import { runInTenant } from '../common/tenant-context';
import { BalanceService } from '../stock/balance.service';
import { LimitsService } from '../subscription/limits.service';

export interface ArticleInput {
  code?: string; name?: string; rollWidthCm?: number; cutMode?: CutMode; barcodeEnabled?: boolean; extra?: Prisma.InputJsonValue;
}

const MAX_PHOTO = 5 * 1024 * 1024;
const MAGIC: { mime: string; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/png', test: (b) => b.length > 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/jpeg', test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/webp', test: (b) => b.length > 12 && b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
];

function clean(input: ArticleInput, partial: boolean): Prisma.ArticleUncheckedUpdateInput {
  const out: Prisma.ArticleUncheckedUpdateInput = {};
  if (!partial || input.code !== undefined) {
    const code = (input.code ?? '').trim();
    if (!code) throw new BadRequestException('Укажите артикул');
    out.code = code;
  }
  if (!partial || input.name !== undefined) {
    const name = (input.name ?? '').trim();
    if (!name) throw new BadRequestException('Укажите название');
    out.name = name;
  }
  if (!partial || input.rollWidthCm !== undefined) {
    if (!Number.isInteger(input.rollWidthCm) || (input.rollWidthCm as number) <= 0) throw new BadRequestException('Ширина рулона должна быть целым числом сантиметров больше 0');
    out.rollWidthCm = input.rollWidthCm;
  }
  if (!partial || input.cutMode !== undefined) {
    if (input.cutMode !== 'LINEAR' && input.cutMode !== 'ANY') throw new BadRequestException('Режим резки: LINEAR или ANY');
    out.cutMode = input.cutMode;
  }
  if (input.barcodeEnabled !== undefined) out.barcodeEnabled = !!input.barcodeEnabled;
  if (input.extra !== undefined) out.extra = input.extra;
  return out;
}

@Injectable()
export class ArticlesService {
  constructor(private readonly prisma: PrismaService, private readonly limits: LimitsService, private readonly storage: ObjectStorage, private readonly balances: BalanceService) {}

  async create(orgId: string, input: ArticleInput): Promise<Article> {
    const data = clean(input, false) as Prisma.ArticleUncheckedCreateInput;
    await this.limits.assertCanAdd(orgId, 'article');
    try {
      return await runInTenant(this.prisma, orgId, (tx) => tx.article.create({ data: { ...data, orgId } }));
    } catch (e) { throw this.mapUnique(e); }
  }

  async list(orgId: string, q?: string, stock?: string): Promise<Article[]> {
    const where: Prisma.ArticleWhereInput = q ? { OR: [{ code: { contains: q, mode: 'insensitive' } }, { name: { contains: q, mode: 'insensitive' } }] } : {};
    const rows = await runInTenant(this.prisma, orgId, (tx) => tx.article.findMany({ where, orderBy: { code: 'asc' } }));
    if (stock !== 'inStock' && stock !== 'empty') return rows;
    const inStock = await this.balances.articleIdsInStock(orgId);
    return rows.filter((a) => (stock === 'inStock') === inStock.has(a.id));
  }

  async get(orgId: string, id: string): Promise<Article> {
    const a = await runInTenant(this.prisma, orgId, (tx) => tx.article.findUnique({ where: { id } }));
    if (!a) throw new NotFoundException();
    return a;
  }

  async update(orgId: string, id: string, input: ArticleInput): Promise<Article> {
    await this.get(orgId, id);
    const data = clean(input, true);
    try {
      return await runInTenant(this.prisma, orgId, (tx) => tx.article.update({ where: { id }, data }));
    } catch (e) { throw this.mapUnique(e); }
  }

  async remove(orgId: string, id: string): Promise<void> {
    const a = await this.get(orgId, id);
    const used = await runInTenant(this.prisma, orgId, async (tx) => (await tx.material.count({ where: { articleId: id } })) + (await tx.sku.count({ where: { articleId: id } })));
    if (used > 0) throw new ConflictException('У артикула есть остатки или готовые ковры, удалить нельзя');
    await runInTenant(this.prisma, orgId, (tx) => tx.article.delete({ where: { id } }));
    if (a.photoKey) await this.storage.delete(a.photoKey);
  }

  async setPhoto(orgId: string, id: string, file: { buffer: Buffer; mimetype: string; size: number } | undefined): Promise<Article> {
    const a = await this.get(orgId, id);
    if (!file) throw new BadRequestException('Файл не передан');
    if (file.size > MAX_PHOTO) throw new BadRequestException('Фото больше 5 МБ');
    const magic = MAGIC.find((m) => m.mime === file.mimetype && m.test(file.buffer));
    if (!magic) throw new BadRequestException('Допустимы изображения JPEG, PNG и WebP');
    await this.limits.assertPhotoQuota(orgId, Math.max(0, file.size - a.photoBytes));
    const key = `${orgId}/photos/${randomUUID()}`;
    await this.storage.put(key, file.buffer, magic.mime);
    if (a.photoKey) await this.storage.delete(a.photoKey);
    return runInTenant(this.prisma, orgId, (tx) => tx.article.update({ where: { id }, data: { photoKey: key, photoBytes: file.size } }));
  }

  private mapUnique(e: unknown): unknown {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return new ConflictException('Артикул с таким кодом уже есть');
    return e;
  }
}
