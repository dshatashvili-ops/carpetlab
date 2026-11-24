import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { Roles } from '../common/roles.guard';
import { BarcodesService } from './barcodes.service';
import { LabelsService } from './labels.service';

@Controller()
export class BarcodesController {
  constructor(private readonly barcodes: BarcodesService, private readonly labels: LabelsService) {}

  @Roles('OWNER') @Put('org/gs-prefix')
  prefix(@Req() req: Request, @Body() body: { prefix: string }) { return this.barcodes.setPrefix(req.auth!.orgId, body.prefix); }

  @Roles('OWNER', 'OPERATOR') @Put('skus/:id/barcode')
  manual(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: { ean13: string }) { return this.barcodes.setManual(req.auth!.orgId, id, body.ean13); }

  @Roles('OWNER', 'OPERATOR') @Post('skus/:id/assign-barcode')
  assign(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) { return this.barcodes.assignExisting(req.auth!.orgId, id); }

  @Get('skus/:id/label.pdf')
  async label(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Query('copies') copies: string | undefined, @Res() res: Response): Promise<void> {
    const n = this.labels.parseCopies(copies);
    const pdf = await this.labels.render(req.auth!.orgId, id, n);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="label-${id}.pdf"`);
    res.send(pdf);
  }
}
