import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/configure-app';
import { Mailer } from '../../src/common/mailer';
import { ObjectStorage } from '../../src/common/storage';
import { YooKassaClient } from '../../src/subscription/payments/yookassa.client';

export class FakeMailer extends Mailer {
  sent: { to: string; subject: string; html: string }[] = [];
  async send(to: string, subject: string, html: string): Promise<void> {
    this.sent.push({ to, subject, html });
  }
}

export class MemoryStorage extends ObjectStorage {
  files = new Map<string, Buffer>();
  async put(key: string, buf: Buffer): Promise<void> { this.files.set(key, buf); }
  async delete(key: string): Promise<void> { this.files.delete(key); }
}

export class FakeYooKassa extends YooKassaClient {
  payments = new Map<string, string>();
  created: { amountKopecks: number; description: string }[] = [];
  getCalls = 0;
  private n = 0;
  async createPayment(input: { amountKopecks: number; description: string; returnUrl: string; idempotenceKey: string }) {
    const id = `yk-${++this.n}`;
    this.payments.set(id, 'pending');
    this.created.push({ amountKopecks: input.amountKopecks, description: input.description });
    return { id, confirmationUrl: `https://pay.example/confirm/${id}` };
  }
  async getPayment(id: string): Promise<{ id: string; status: 'pending' | 'succeeded' | 'canceled' } | null> {
    this.getCalls++;
    const status = this.payments.get(id);
    return status ? { id, status: status as 'pending' | 'succeeded' | 'canceled' } : null;
  }
}

export const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_ADMIN_URL } } });

export async function resetDb(): Promise<void> {
  await admin.$executeRawUnsafe(
    `TRUNCATE "Organization","User","Membership","Session","EmailToken","Subscription","TariffPrice","Payment","SubscriptionNotice","Article","SizeTemplate","Material","Sku","StockMovement","CutDocument","CutDocumentLine","CutDocumentVersion","BarcodeSequence","DocCounter" CASCADE`,
  );
}

export async function createTestApp(): Promise<{ app: INestApplication; mailer: FakeMailer; yookassa: FakeYooKassa }> {
  const mailer = new FakeMailer();
  const yookassa = new FakeYooKassa();
  const mod = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(Mailer).useValue(mailer).overrideProvider(ObjectStorage).useValue(new MemoryStorage()).overrideProvider(YooKassaClient).useValue(yookassa).compile();
  const app = mod.createNestApplication();
  configureApp(app);
  await app.init();
  return { app, mailer, yookassa };
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
