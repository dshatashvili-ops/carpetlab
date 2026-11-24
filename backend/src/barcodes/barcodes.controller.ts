import { Body, Controller, Param, ParseUUIDPipe, Post, Put, Req } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../common/roles.guard';
import { BarcodesService } from './barcodes.service';

@Controller()
export class BarcodesController {
  constructor(private readonly barcodes: BarcodesService) {}

  @Roles('OWNER') @Put('org/gs-prefix')
  prefix(@Req() req: Request, @Body() body: { prefix: string }) { return this.barcodes.setPrefix(req.auth!.orgId, body.prefix); }

  @Roles('OWNER', 'OPERATOR') @Put('skus/:id/barcode')
  manual(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: { ean13: string }) { return this.barcodes.setManual(req.auth!.orgId, id, body.ean13); }

  @Roles('OWNER', 'OPERATOR') @Post('skus/:id/assign-barcode')
  assign(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) { return this.barcodes.assignExisting(req.auth!.orgId, id); }
}
