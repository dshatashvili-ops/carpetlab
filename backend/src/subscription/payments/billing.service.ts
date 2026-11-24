import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../common/prisma.service';
import { YooKassaClient } from './yookassa.client';

export const MONTHS = [1, 3, 6, 12] as const;
const PLANS = [1, 2, 3];

/** Adds calendar months, clamping the day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(date: Date, months: number): Date {
  const d = new Date(date.getTime());
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService, private readonly yookassa: YooKassaClient) {}

  prices(): Promise<{ plan: number; months: number; priceKopecks: number }[]> {
    return this.prisma.tariffPrice.findMany({ select: { plan: true, months: true, priceKopecks: true }, orderBy: [{ plan: 'asc' }, { months: 'asc' }] });
  }

  async checkout(orgId: string, input: { plan?: number; months?: number; method?: string }) {
    const { plan, months, method } = input;
    if (!PLANS.includes(plan as number)) throw new BadRequestException('Выберите тариф 1, 2 или 3');
    if (!(MONTHS as readonly number[]).includes(months as number)) throw new BadRequestException('Срок подписки: 1, 3, 6 или 12 месяцев');
    if (method !== 'YOOKASSA' && method !== 'INVOICE') throw new BadRequestException('Способ оплаты: YOOKASSA или INVOICE');
    const price = await this.prisma.tariffPrice.findUnique({ where: { plan_months: { plan: plan!, months: months! } } });
    if (!price) throw new BadRequestException({ code: 'PRICE_NOT_SET', message: 'Цена для этого тарифа и срока пока не задана' });
    const description = `CarpetLAB, тариф ${plan}, ${months} мес.`;
    const payment = await this.prisma.payment.create({ data: { orgId, method, plan: plan!, months: months!, amountKopecks: price.priceKopecks } });
    if (method === 'INVOICE') {
      const org = await this.prisma.organization.findUniqueOrThrow({ where: { id: orgId } });
      return { paymentId: payment.id, invoice: { amountKopecks: price.priceKopecks, description, payer: org.name } };
    }
    const created = await this.yookassa.createPayment({
      amountKopecks: price.priceKopecks, description, idempotenceKey: payment.id,
      returnUrl: `${process.env.APP_URL ?? 'http://localhost:5173'}/app/billing`,
    });
    await this.prisma.payment.update({ where: { id: payment.id }, data: { externalId: created.id } });
    return { paymentId: payment.id, confirmationUrl: created.confirmationUrl };
  }

  /** Webhook: the body only names a payment; its real status is fetched from YooKassa. */
  async handleWebhook(body: unknown): Promise<void> {
    const id = (body as { object?: { id?: unknown } } | null)?.object?.id;
    if (typeof id !== 'string' || id.length === 0 || id.length > 100) return;
    const payment = await this.prisma.payment.findUnique({ where: { externalId: id } });
    if (!payment) return;
    const remote = await this.yookassa.getPayment(id);
    if (!remote) return;
    if (remote.status === 'succeeded') await this.apply(payment.id);
    else if (remote.status === 'canceled') await this.prisma.payment.updateMany({ where: { id: payment.id, status: 'PENDING' }, data: { status: 'CANCELED' } });
  }

  async markInvoicePaid(paymentId: string): Promise<{ alreadyApplied: boolean }> {
    const payment = await this.prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new NotFoundException();
    if (payment.method !== 'INVOICE') throw new BadRequestException('Это не счет по реквизитам');
    return { alreadyApplied: !(await this.apply(paymentId)) };
  }

  /** Extends the subscription exactly once per payment (claimed by an atomic conditional update). Returns false if already applied. */
  async apply(paymentId: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payment.updateMany({ where: { id: paymentId, appliedAt: null }, data: { appliedAt: new Date(), status: 'SUCCEEDED' } });
      if (claimed.count === 0) return false;
      const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId } });
      const sub = await tx.subscription.findUniqueOrThrow({ where: { orgId: p.orgId } });
      const base = new Date(Math.max(Date.now(), sub.expiresAt.getTime()));
      await tx.subscription.update({ where: { orgId: p.orgId }, data: { plan: p.plan, status: 'ACTIVE', expiresAt: addMonths(base, p.months) } });
      return true;
    });
  }
}
