import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module';
import { CalculationService } from './calculation.service';
import { CuttingController } from './cutting.controller';

@Module({ imports: [StockModule], controllers: [CuttingController], providers: [CalculationService], exports: [CalculationService] })
export class CuttingModule {}
