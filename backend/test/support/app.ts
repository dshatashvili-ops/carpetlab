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

import request from 'supertest';

export async function registerOwner(app: INestApplication, email = 'owner@example.com'): Promise<string[]> {
  const res = await request(app.getHttpServer()).post('/api/auth/register').send({ email, password: 'correct-horse-1', orgName: 'Ковры+' });
  return res.headers['set-cookie'] as unknown as string[];
}

/** Invites an employee as `role`, accepts the invite and returns the employee's session cookie. */
export async function addEmployee(app: INestApplication, mailer: FakeMailer, ownerCookie: string[], email: string, role: 'OPERATOR' | 'CUTTER'): Promise<string[]> {
  await request(app.getHttpServer()).post('/api/employees').set('Cookie', ownerCookie).send({ email, role }).expect(201);
  const mail = mailer.sent.filter((m) => m.to === email).pop()!;
  const token = /token=([a-f0-9]+)/.exec(mail.html)![1];
  const res = await request(app.getHttpServer()).post('/api/auth/accept-invite').send({ token, password: 'correct-horse-1' });
  return res.headers['set-cookie'] as unknown as string[];
}
