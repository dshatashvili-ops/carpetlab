import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, SizeTemplate } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { runInTenant } from '../common/tenant-context';

@Injectable()
export class SizesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(orgId: string, input: { widthCm?: number; lengthCm?: number }): Promise<SizeTemplate> {
    const { widthCm, lengthCm } = input;
    if (!Number.isInteger(widthCm) || !Number.isInteger(lengthCm) || (widthCm as number) <= 0 || (lengthCm as number) <= 0) {
      throw new BadRequestException('Размеры должны быть целыми числами сантиметров больше 0');
    }
    try {
      return await runInTenant(this.prisma, orgId, (tx) => tx.sizeTemplate.create({ data: { orgId, widthCm: widthCm!, lengthCm: lengthCm! } }));
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException('Такой размер уже есть');
      throw e;
    }
  }

  list(orgId: string): Promise<SizeTemplate[]> {
    return runInTenant(this.prisma, orgId, (tx) => tx.sizeTemplate.findMany({ orderBy: [{ widthCm: 'asc' }, { lengthCm: 'asc' }] }));
  }

  async remove(orgId: string, id: string): Promise<void> {
    await runInTenant(this.prisma, orgId, async (tx) => {
      if (!(await tx.sizeTemplate.findUnique({ where: { id } }))) throw new NotFoundException();
      const used = (await tx.sku.count({ where: { sizeId: id } })) + (await tx.cutDocumentLine.count({ where: { sizeId: id } }));
      if (used > 0) throw new ConflictException('Размер используется в готовых коврах или документах раскроя');
      await tx.sizeTemplate.delete({ where: { id } });
    });
  }
}
