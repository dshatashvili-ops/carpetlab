import { BadRequestException, Body, Controller, Get, Patch, Req } from '@nestjs/common';
import { Request } from 'express';
import { PrismaService } from '../common/prisma.service';
import { Roles } from '../common/roles.guard';

interface SettingsBody { minRemnantSideCm?: number; labelWidthMm?: number; labelHeightMm?: number }

@Controller('org/settings')
export class OrgSettingsController {
  constructor(private readonly prisma: PrismaService) {}

  private async read(orgId: string) {
    const o = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
    return { name: o.name, gsPrefix: o.gsPrefix, minRemnantSideCm: o.minRemnantSideCm, labelWidthMm: o.labelWidthMm, labelHeightMm: o.labelHeightMm };
  }

  @Get()
  get(@Req() req: Request) { return this.read(req.auth!.orgId); }

  @Roles('OWNER') @Patch()
  async update(@Req() req: Request, @Body() body: SettingsBody) {
    const data: SettingsBody = {};
    if (body.minRemnantSideCm !== undefined) {
      if (!Number.isInteger(body.minRemnantSideCm) || body.minRemnantSideCm < 0) throw new BadRequestException('Порог обрезка — целое число сантиметров, не меньше 0');
      data.minRemnantSideCm = body.minRemnantSideCm;
    }
    for (const k of ['labelWidthMm', 'labelHeightMm'] as const) {
      if (body[k] !== undefined) {
        if (!Number.isInteger(body[k]) || (body[k] as number) <= 0) throw new BadRequestException('Размер этикетки — целое число миллиметров больше 0');
        data[k] = body[k];
      }
    }
    await this.prisma.organization.update({ where: { id: req.auth!.orgId }, data });
    return this.read(req.auth!.orgId);
  }
}
