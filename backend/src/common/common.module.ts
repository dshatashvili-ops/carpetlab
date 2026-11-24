import { Global, Module } from '@nestjs/common';
import { createMailer, Mailer } from './mailer';
import { PrismaService } from './prisma.service';
import { LocalDiskStorage, ObjectStorage } from './storage';

@Global()
@Module({
  providers: [PrismaService, { provide: Mailer, useFactory: createMailer }, { provide: ObjectStorage, useClass: LocalDiskStorage }],
  exports: [PrismaService, Mailer, ObjectStorage],
})
export class CommonModule {}
