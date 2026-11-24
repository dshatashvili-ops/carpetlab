import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query, Req, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Request } from 'express';
import { Roles } from '../common/roles.guard';
import { ArticleInput, ArticlesService } from './articles.service';

@Controller('articles')
export class ArticlesController {
  constructor(private readonly articles: ArticlesService) {}

  @Roles('OWNER', 'OPERATOR') @Post()
  create(@Req() req: Request, @Body() body: ArticleInput) { return this.articles.create(req.auth!.orgId, body); }

  @Get()
  list(@Req() req: Request, @Query('q') q?: string, @Query('stock') stock?: string) { return this.articles.list(req.auth!.orgId, q, stock); }

  @Get(':id')
  get(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string) { return this.articles.get(req.auth!.orgId, id); }

  @Roles('OWNER', 'OPERATOR') @Patch(':id')
  update(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @Body() body: ArticleInput) { return this.articles.update(req.auth!.orgId, id, body); }

  @Roles('OWNER', 'OPERATOR') @Delete(':id') @HttpCode(204)
  async remove(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string): Promise<void> { await this.articles.remove(req.auth!.orgId, id); }

  @Roles('OWNER', 'OPERATOR') @Post(':id/photo')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  photo(@Req() req: Request, @Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: Express.Multer.File) {
    return this.articles.setPhoto(req.auth!.orgId, id, file);
  }
}
