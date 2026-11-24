import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { CatalogModule } from './catalog/catalog.module';
import { StockModule } from './stock/stock.module';
import { CuttingModule } from './cutting/cutting.module';
import { OrgsModule } from './orgs/orgs.module';
import { CommonModule } from './common/common.module';
import { HealthController } from './health.controller';

@Module({ imports: [CommonModule, AuthModule, SubscriptionModule, OrgsModule, StockModule, CatalogModule, CuttingModule], controllers: [HealthController] })
export class AppModule {}
