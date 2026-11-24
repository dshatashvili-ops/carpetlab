import { Controller, Get, Req } from '@nestjs/common';
import { Request } from 'express';
import { SubscriptionInfo, SubscriptionService } from './subscription.service';

@Controller('subscription')
export class SubscriptionController {
  constructor(private readonly subs: SubscriptionService) {}

  @Get()
  get(@Req() req: Request): Promise<SubscriptionInfo> {
    return this.subs.getStatus(req.auth!.orgId);
  }
}
