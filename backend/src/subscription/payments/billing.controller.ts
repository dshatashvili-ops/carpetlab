import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../../common/public.decorator';
import { Roles } from '../../common/roles.guard';
import { ServiceAdmin } from '../../common/service-admin.guard';
import { PLANS } from '../plans';
import { BillingService } from './billing.service';

@Controller()
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('billing/prices')
  prices() { return this.billing.prices(); }

  @Public() @Get('public/prices')
  async publicPrices() {
    const prices = await this.billing.prices();
    return {
      plans: ([1, 2, 3] as const).map((plan) => ({
        plan, articles: PLANS[plan].articles, employees: PLANS[plan].employees, photoMb: PLANS[plan].photoBytes / (1024 * 1024),
        prices: prices.filter((p) => p.plan === plan).map(({ months, priceKopecks }) => ({ months, priceKopecks })),
      })),
    };
  }

  @Roles('OWNER') @Post('billing/checkout')
  checkout(@Req() req: Request, @Body() body: { plan?: number; months?: number; method?: string }) { return this.billing.checkout(req.auth!.orgId, body); }

  @Public() @Post('billing/yookassa/webhook') @HttpCode(200)
  async webhook(@Body() body: unknown): Promise<{ ok: true }> {
    await this.billing.handleWebhook(body);
    return { ok: true };
  }

  @ServiceAdmin() @Post('admin/invoices/:id/mark-paid')
  markPaid(@Param('id', ParseUUIDPipe) id: string) { return this.billing.markInvoicePaid(id); }
}
