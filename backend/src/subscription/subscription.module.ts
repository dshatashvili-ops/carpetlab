import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { LimitsService } from './limits.service';
import { SubscriptionController } from './subscription.controller';
import { SubscriptionGuard } from './subscription.guard';
import { SubscriptionService } from './subscription.service';

@Global()
@Module({
  controllers: [SubscriptionController],
  providers: [SubscriptionService, LimitsService, { provide: APP_GUARD, useClass: SubscriptionGuard }],
  exports: [SubscriptionService, LimitsService],
})
export class SubscriptionModule {}
