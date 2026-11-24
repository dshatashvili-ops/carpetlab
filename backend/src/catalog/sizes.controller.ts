import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Roles } from '../common/roles.guard';
import { SizesService } from './sizes.service';

@Controller('sizes')
export class SizesController {
  constructor(private readonly sizes: SizesService) {}

  @Roles('OWNER', 'OPERATOR') @Post()
  create(@Req() req: Request, @Body() body: { widthCm?: number; lengthCm?: number }) { return this.sizes.create(req.auth!.orgId, body); }

  @Get()
  list(@Req() req: Request) { return this.sizes.list(req.auth!.orgId); }

  @Roles('OWNER', 'OPERATOR') @Delete(':id') @HttpCode(204)
  async remove(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string): Promise<void> { await this.sizes.remove(req.auth!.orgId, id); }
}
