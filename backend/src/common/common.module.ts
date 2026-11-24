import { Global, Module } from '@nestjs/common';
import { ConsoleMailer, Mailer } from './mailer';
import { PrismaService } from './prisma.service';
import { LocalDiskStorage, ObjectStorage } from './storage';

@Global()
@Module({
  providers: [PrismaService, { provide: Mailer, useClass: ConsoleMailer }, { provide: ObjectStorage, useClass: LocalDiskStorage }],
  exports: [PrismaService, Mailer, ObjectStorage],
})
export class CommonModule {}
