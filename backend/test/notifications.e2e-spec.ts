import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { NotificationsService } from '../src/subscription/notifications.service';
import { addEmployee, admin, createTestApp, FakeMailer, registerOwner, resetDb } from './support/app';

const DAY = 86_400_000;
const EXPIRES = new Date('2027-03-31T12:00:00Z');
const daysBefore = (n: number): Date => new Date(EXPIRES.getTime() - n * DAY);

describe('expiry notifications', () => {
  let app: INestApplication; let mailer: FakeMailer; let owner: string[]; let orgId: string; let svc: NotificationsService;
  const setSub = (data: object) => admin.subscription.update({ where: { orgId }, data });

  beforeEach(async () => {
    await resetDb(); ({ app, mailer } = await createTestApp()); owner = await registerOwner(app);
    orgId = (await admin.organization.findFirstOrThrow()).id; svc = app.get(NotificationsService);
    await setSub({ status: 'ACTIVE', plan: 2, expiresAt: EXPIRES });
    mailer.sent.length = 0;
  });
  afterEach(async () => { await app.close(); });
  afterAll(async () => { await admin.$disconnect(); });

  it('sends the 30-day notice to the owner, and nothing at 29 days', async () => {
    expect(await svc.run(daysBefore(29))).toBe(0);
    expect(await svc.run(daysBefore(30))).toBe(1);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0].to).toBe('owner@example.com');
    expect(mailer.sent[0].subject).toContain('30');
  });

  it('sends the 15-day notice and nothing between 14 and 8 days', async () => {
    expect(await svc.run(daysBefore(15))).toBe(1);
    for (let n = 14; n >= 8; n--) expect(await svc.run(daysBefore(n))).toBe(0);
    expect(mailer.sent).toHaveLength(1);
  });

  it('sends one notice per day for the last 7 days: 7 mails with distinct subjects', async () => {
    for (let n = 7; n >= 1; n--) expect(await svc.run(daysBefore(n))).toBe(1);
    expect(mailer.sent).toHaveLength(7);
    expect(new Set(mailer.sent.map((m) => m.subject)).size).toBe(7);
  });

  it('running twice on the same day does not duplicate', async () => {
    await svc.run(daysBefore(30));
    expect(await svc.run(daysBefore(30))).toBe(0);
    expect(mailer.sent).toHaveLength(1);
  });

  it('after a renewal the notices start over for the new expiry date', async () => {
    await svc.run(daysBefore(30));
    const renewed = new Date(EXPIRES.getTime() + 90 * DAY);
    await setSub({ expiresAt: renewed });
    expect(await svc.run(new Date(renewed.getTime() - 30 * DAY))).toBe(1);
    expect(mailer.sent).toHaveLength(2);
  });

  it('an expired subscription gets no notices', async () => {
    expect(await svc.run(new Date(EXPIRES.getTime() + DAY))).toBe(0);
  });

  it('a trial only gets the last 3 days of notices', async () => {
    await setSub({ status: 'TRIAL', plan: 1 });
    expect(await svc.run(daysBefore(7))).toBe(0);
    expect(await svc.run(daysBefore(4))).toBe(0);
    expect(await svc.run(daysBefore(3))).toBe(1);
    expect(await svc.run(daysBefore(1))).toBe(1);
  });

  it('every owner is notified, operators and cutters are not', async () => {
    await addEmployee(app, mailer, owner, 'op@example.com', 'OPERATOR');
    const second = await admin.user.create({ data: { email: 'owner2@example.com', passwordHash: 'x' } });
    await admin.membership.create({ data: { userId: second.id, orgId, role: 'OWNER' } });
    mailer.sent.length = 0;
    await svc.run(daysBefore(15));
    expect(mailer.sent.map((m) => m.to).sort()).toEqual(['owner2@example.com', 'owner@example.com']);
  });

  it('GET /api/subscription carries a banner: info at 20 days, none at 40, expired after the end', async () => {
    const banner = async () => (await request(app.getHttpServer()).get('/api/subscription').set('Cookie', owner)).body.noticeBanner;
    await setSub({ expiresAt: new Date(Date.now() + 20 * DAY) });
    expect(await banner()).toMatchObject({ level: 'info', daysLeft: 20 });
    await setSub({ expiresAt: new Date(Date.now() + 40 * DAY) });
    expect(await banner()).toBeNull();
    await setSub({ expiresAt: new Date(Date.now() + 5 * DAY) });
    expect(await banner()).toMatchObject({ level: 'warning', daysLeft: 5 });
    await setSub({ expiresAt: new Date(Date.now() - DAY) });
    expect(await banner()).toMatchObject({ level: 'expired', daysLeft: 0 });
  });
});
