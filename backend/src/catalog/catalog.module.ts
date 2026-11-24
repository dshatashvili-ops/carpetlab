import { Module } from '@nestjs/common';
import { ArticlesController } from './articles.controller';
import { ArticlesService } from './articles.service';
import { SizesController } from './sizes.controller';
import { SizesService } from './sizes.service';

@Module({ controllers: [ArticlesController, SizesController], providers: [ArticlesService, SizesService] })
export class CatalogModule {}
