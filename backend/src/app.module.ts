import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthModule } from './auth/auth.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { CatalogModule } from './catalog/catalog.module';
import { StockModule } from './stock/stock.module';
import { CuttingModule } from './cutting/cutting.module';
import { DocumentsModule } from './documents/documents.module';
import { BarcodesModule } from './barcodes/barcodes.module';
import { AdminModule } from './admin/admin.module';
import { OrgsModule } from './orgs/orgs.module';
import { CommonModule } from './common/common.module';
import { HealthController } from './health.controller';

@Module({ imports: [ScheduleModule.forRoot(), CommonModule, AuthModule, SubscriptionModule, OrgsModule, StockModule, CatalogModule, CuttingModule, DocumentsModule, BarcodesModule, AdminModule], controllers: [HealthController] })
export class AppModule {}
