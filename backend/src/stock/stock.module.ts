import { Module } from '@nestjs/common';
import { BalanceService } from './balance.service';
import { LedgerService } from './ledger.service';
import { StockController } from './stock.controller';
import { StockService } from './stock.service';

@Module({
  controllers: [StockController],
  providers: [LedgerService, BalanceService, StockService],
  exports: [LedgerService, BalanceService],
})
export class StockModule {}
