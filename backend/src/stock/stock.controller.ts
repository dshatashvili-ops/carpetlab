import { Body, Controller, Get, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ItemType } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../common/roles.guard';
import { BalanceService } from './balance.service';
import { StockService } from './stock.service';

@Controller('stock')
export class StockController {
  constructor(private readonly stock: StockService, private readonly balances: BalanceService) {}

  @Roles('OWNER', 'OPERATOR') @Post('rolls')
  receive(@Req() req: Request, @Body() body: { articleId?: string; widthCm?: number; lengthCm?: number; count?: number }) {
    return this.stock.receiveRolls(req.auth!.orgId, req.auth!.userId, body);
  }

  @Roles('OWNER', 'OPERATOR') @Post('adjust')
  adjust(@Req() req: Request, @Body() body: { itemType?: ItemType; id?: string; qtyDelta?: number; reason?: string }) {
    return this.stock.adjust(req.auth!.orgId, req.auth!.userId, body);
  }

  @Get('materials')
  materials(@Req() req: Request, @Query('articleId') articleId?: string) { return this.balances.materials(req.auth!.orgId, articleId); }

  @Get('carpets')
  carpets(@Req() req: Request, @Query('articleId') articleId?: string) { return this.balances.carpets(req.auth!.orgId, { articleId }); }

  @Get('history')
  history(@Req() req: Request, @Query('itemId', ParseUUIDPipe) itemId: string) { return this.stock.history(req.auth!.orgId, itemId); }
}
