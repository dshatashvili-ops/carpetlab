import { BadRequestException, Body, Controller, Get, Put, Query } from '@nestjs/common';
import { PaymentStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { ServiceAdmin } from '../common/service-admin.guard';
import { runInTenant } from '../common/tenant-context';
import { MONTHS } from '../subscription/payments/billing.service';

@ServiceAdmin()
@Controller('admin')
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('orgs')
  async orgs() {
    const orgs = await this.prisma.organization.findMany({ include: { memberships: { include: { user: true } } }, orderBy: { createdAt: 'asc' } });
    const subs = await this.prisma.subscription.findMany();
    return Promise.all(orgs.map(async (o) => {
      const s = subs.find((x) => x.orgId === o.id);
      const articlesCount = await runInTenant(this.prisma, o.id, (tx) => tx.article.count());
      return {
        id: o.id, name: o.name, createdAt: o.createdAt, articlesCount, membersCount: o.memberships.length,
        owners: o.memberships.filter((m) => m.role === 'OWNER').map((m) => m.user.email),
        subscription: s ? { plan: s.plan, status: s.expiresAt < new Date() ? 'EXPIRED' : s.status, expiresAt: s.expiresAt } : null,
      };
    }));
  }

  @Get('invoices')
  async invoices(@Query('status') status?: string) {
    if (status && !['PENDING', 'SUCCEEDED', 'CANCELED'].includes(status)) throw new BadRequestException('Неизвестный статус');
    const rows = await this.prisma.payment.findMany({ where: { method: 'INVOICE', ...(status ? { status: status as PaymentStatus } : {}) }, orderBy: { createdAt: 'desc' } });
    const orgs = await this.prisma.organization.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.orgId))] } } });
    return rows.map((r) => ({ id: r.id, orgId: r.orgId, orgName: orgs.find((o) => o.id === r.orgId)?.name ?? null, plan: r.plan, months: r.months, amountKopecks: r.amountKopecks, status: r.status, appliedAt: r.appliedAt, createdAt: r.createdAt }));
  }

  @Put('tariff-prices')
  async setPrices(@Body() body: { prices?: { plan: number; months: number; priceKopecks: number }[] }) {
    const prices = body?.prices;
    if (!Array.isArray(prices)) throw new BadRequestException('Передайте список prices');
    for (const p of prices) {
      if (![1, 2, 3].includes(p?.plan)) throw new BadRequestException('Тариф: 1, 2 или 3');
      if (!(MONTHS as readonly number[]).includes(p?.months)) throw new BadRequestException('Срок: 1, 3, 6 или 12 месяцев');
      if (!Number.isInteger(p?.priceKopecks) || p.priceKopecks <= 0) throw new BadRequestException('Цена — целое число копеек больше 0');
    }
    await this.prisma.$transaction(prices.map((p) => this.prisma.tariffPrice.upsert({
      where: { plan_months: { plan: p.plan, months: p.months } }, create: p, update: { priceKopecks: p.priceKopecks },
    })));
    return this.prisma.tariffPrice.findMany({ select: { plan: true, months: true, priceKopecks: true }, orderBy: [{ plan: 'asc' }, { months: 'asc' }] });
  }
}
