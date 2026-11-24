import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../common/roles.guard';
import { CalcInput } from '../cutting/calculation.service';
import { DocumentsService } from './documents.service';

@Controller('cuts')
export class DocumentsController {
  constructor(private readonly docs: DocumentsService) {}

  @Roles('OWNER', 'OPERATOR') @Post()
  execute(@Req() req: Request, @Body() body: CalcInput) { return this.docs.execute({ orgId: req.auth!.orgId, userId: req.auth!.userId }, body); }

  @Get()
  list(@Req() req: Request) { return this.docs.list(req.auth!.orgId); }

  @Get(':id')
  get(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) { return this.docs.get(req.auth!.orgId, id); }
}
