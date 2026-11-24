import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { CatalogModule } from './catalog/catalog.module';
import { OrgsModule } from './orgs/orgs.module';
import { CommonModule } from './common/common.module';
import { HealthController } from './health.controller';

@Module({ imports: [CommonModule, AuthModule, SubscriptionModule, OrgsModule, CatalogModule], controllers: [HealthController] })
export class AppModule {}
