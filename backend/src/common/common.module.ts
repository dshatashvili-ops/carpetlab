import { Global, Module } from '@nestjs/common';
import { ConsoleMailer, Mailer } from './mailer';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, { provide: Mailer, useClass: ConsoleMailer }],
  exports: [PrismaService, Mailer],
})
export class CommonModule {}
