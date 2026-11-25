import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NoticeKind } from '@prisma/client';
import { appUrl } from '../common/app-url';
import { Mailer } from '../common/mailer';
import { PrismaService } from '../common/prisma.service';

const DAY = 86_400_000;
const KIND_BY_DAYS: Record<number, NoticeKind> = { 30: 'D30', 15: 'D15', 7: 'D7', 6: 'D6', 5: 'D5', 4: 'D4', 3: 'D3', 2: 'D2', 1: 'D1' };
const TRIAL_KINDS = new Set<NoticeKind>(['D3', 'D2', 'D1']);

export const daysLeft = (expiresAt: Date, now: Date): number => Math.ceil((expiresAt.getTime() - now.getTime()) / DAY);

export function bannerFor(status: string, expiresAt: Date, now: Date): { level: 'info' | 'warning' | 'expired'; daysLeft: number } | null {
  const left = daysLeft(expiresAt, now);
  if (left <= 0) return { level: 'expired', daysLeft: 0 };
  if (status === 'TRIAL') return left <= 3 ? { level: 'warning', daysLeft: left } : null;
  if (left <= 7) return { level: 'warning', daysLeft: left };
  if (left <= 30) return { level: 'info', daysLeft: left };
  return null;
}

@Injectable()
export class NotificationsService {
  private readonly log = new Logger('Notifications');
  constructor(private readonly prisma: PrismaService, private readonly mailer: Mailer) {}

  /** 09:00 Moscow time every day. */
  @Cron('0 6 * * *')
  async daily(): Promise<void> {
    const sent = await this.run(new Date());
    this.log.log(`expiry notices sent: ${sent}`);
  }

  /** Sends today's notices; returns the number of e-mails sent. Idempotent per (organization, notice kind, expiry date). */
  async run(now: Date): Promise<number> {
    const subs = await this.prisma.subscription.findMany({ where: { expiresAt: { gt: now } } });
    let sent = 0;
    for (const sub of subs) {
      const left = daysLeft(sub.expiresAt, now);
      const kind = KIND_BY_DAYS[left];
      if (!kind) continue;
      if (sub.status === 'TRIAL' && !TRIAL_KINDS.has(kind)) continue;
      try {
        await this.prisma.subscriptionNotice.create({ data: { orgId: sub.orgId, kind, expiresAt: sub.expiresAt } });
      } catch {
        continue; // already sent for this expiry date
      }
      const owners = await this.prisma.membership.findMany({ where: { orgId: sub.orgId, role: 'OWNER' }, include: { user: true } });
      for (const o of owners) {
        const trial = sub.status === 'TRIAL';
        try {
          await this.mailer.send(
          o.user.email,
          `${trial ? 'Пробный период' : 'Подписка'} CarpetLAB заканчивается через ${left} дн.`,
          `<p>${trial ? 'Пробный период' : 'Подписка'} заканчивается ${sub.expiresAt.toLocaleDateString('ru-RU')}. После этого данные останутся, но будут доступны только для просмотра.</p><p>Продлить: <a href="${appUrl('/app/billing')}">${appUrl('/app/billing')}</a></p>`,
          );
          sent += 1;
        } catch (err) {
          this.log.warn(`expiry notice to ${o.user.email} failed: ${(err as Error).message}`);
        }
      }
    }
    return sent;
  }
}
