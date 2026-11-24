import { Module } from '@nestjs/common';
import { CuttingModule } from '../cutting/cutting.module';
import { StockModule } from '../stock/stock.module';
import { DocumentEditService } from './document-edit.service';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({ imports: [CuttingModule, StockModule], controllers: [DocumentsController], providers: [DocumentsService, DocumentEditService], exports: [DocumentsService] })
export class DocumentsModule {}
