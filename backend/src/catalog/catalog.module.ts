import { Module } from '@nestjs/common';
import { StockModule } from '../stock/stock.module';
import { ArticlesController } from './articles.controller';
import { ArticlesService } from './articles.service';
import { SizesController } from './sizes.controller';
import { SizesService } from './sizes.service';

@Module({ imports: [StockModule], controllers: [ArticlesController, SizesController], providers: [ArticlesService, SizesService] })
export class CatalogModule {}
