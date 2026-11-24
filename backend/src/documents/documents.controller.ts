import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { Roles } from '../common/roles.guard';
import { CalcInput } from '../cutting/calculation.service';
import { DocumentEditService, EditInput } from './document-edit.service';
import { DocumentsService } from './documents.service';
import { SpecPdfService } from './spec-pdf.service';

@Controller('cuts')
export class DocumentsController {
  constructor(private readonly docs: DocumentsService, private readonly edits: DocumentEditService, private readonly specs: SpecPdfService) {}

  @Roles('OWNER', 'OPERATOR') @Post()
  execute(@Req() req: Request, @Body() body: CalcInput) { return this.docs.execute({ orgId: req.auth!.orgId, userId: req.auth!.userId }, body); }

  @Get()
  list(@Req() req: Request) { return this.docs.list(req.auth!.orgId); }

  @Get(':id')
  get(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) { return this.docs.get(req.auth!.orgId, id); }

  @Roles('OWNER', 'OPERATOR') @Patch(':id')
  edit(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: EditInput) {
    return this.edits.edit({ orgId: req.auth!.orgId, userId: req.auth!.userId }, id, body);
  }

  @Get(':id/history')
  history(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) { return this.edits.history(req.auth!.orgId, id); }

  @Get(':id/spec.pdf')
  async spec(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Res() res: Response): Promise<void> {
    const pdf = await this.specs.render(req.auth!.orgId, id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="spec-${id}.pdf"`);
    res.send(pdf);
  }
}
