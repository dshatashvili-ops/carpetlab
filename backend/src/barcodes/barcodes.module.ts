import { Module } from '@nestjs/common';
import { BarcodesController } from './barcodes.controller';
import { BarcodesService } from './barcodes.service';
import { LabelsService } from './labels.service';

@Module({ controllers: [BarcodesController], providers: [BarcodesService, LabelsService], exports: [BarcodesService] })
export class BarcodesModule {}
