import { Module } from '@nestjs/common';
import { BarcodesModule } from '../barcodes/barcodes.module';
import { CuttingModule } from '../cutting/cutting.module';
import { StockModule } from '../stock/stock.module';
import { DocumentEditService } from './document-edit.service';
import { DocumentsController } from './documents.controller';
import { SpecPdfService } from './spec-pdf.service';
import { DocumentsService } from './documents.service';

@Module({ imports: [CuttingModule, StockModule, BarcodesModule], controllers: [DocumentsController], providers: [DocumentsService, DocumentEditService, SpecPdfService], exports: [DocumentsService] })
export class DocumentsModule {}
