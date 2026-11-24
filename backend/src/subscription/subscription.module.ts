import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { BillingController } from './payments/billing.controller';
import { BillingService } from './payments/billing.service';
import { HttpYooKassaClient, YooKassaClient } from './payments/yookassa.client';
import { LimitsService } from './limits.service';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionGuard } from './subscription.guard';
import { SubscriptionService } from './subscription.service';

@Global()
@Module({
  controllers: [SubscriptionController, BillingController],
  providers: [SubscriptionService, LimitsService, BillingService, { provide: YooKassaClient, useClass: HttpYooKassaClient }, { provide: APP_GUARD, useClass: SubscriptionGuard }],
  exports: [SubscriptionService, LimitsService],
})
export class SubscriptionModule {}
