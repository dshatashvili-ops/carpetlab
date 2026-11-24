import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { Mailer } from '../../src/common/mailer';

export class FakeMailer extends Mailer {
  sent: { to: string; subject: string; html: string }[] = [];
  async send(to: string, subject: string, html: string): Promise<void> {
    this.sent.push({ to, subject, html });
  }
}

export const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_ADMIN_URL } } });

export async function resetDb(): Promise<void> {
  await admin.$executeRawUnsafe(
    `TRUNCATE "Organization","User","Membership","Session","EmailToken","Subscription","TariffPrice","Payment","SubscriptionNotice","Article","SizeTemplate","Material","Sku","StockMovement","CutDocument","CutDocumentLine","CutDocumentVersion","BarcodeSequence","DocCounter" CASCADE`,
  );
}

export async function createTestApp(): Promise<{ app: INestApplication; mailer: FakeMailer }> {
  const mailer = new FakeMailer();
  const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(Mailer).useValue(mailer).compile();
  const app = mod.createNestApplication();
  configureApp(app);
  await app.init();
  return { app, mailer };
}
