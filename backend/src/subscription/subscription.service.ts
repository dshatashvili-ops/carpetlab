import { Injectable, NotFoundException } from '@nestjs/common';
import { SubStatus } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { bannerFor } from './notifications.service';

export interface SubscriptionInfo {
  status: SubStatus; plan: number; expiresAt: Date; daysLeft: number;
  noticeBanner: { level: 'info' | 'warning' | 'expired'; daysLeft: number } | null;
}

@Injectable()
export class SubscriptionService {
  constructor(private readonly prisma: PrismaService) {}

  async getStatus(orgId: string, now = new Date()): Promise<SubscriptionInfo> {
    const sub = await this.prisma.subscription.findUnique({ where: { orgId } });
    if (!sub) throw new NotFoundException('Подписка не найдена');
    const msLeft = sub.expiresAt.getTime() - now.getTime();
    const expired = msLeft <= 0;
    const status = expired ? 'EXPIRED' : sub.status;
    return {
      noticeBanner: bannerFor(status, sub.expiresAt, now),
      status,
      plan: sub.plan,
      expiresAt: sub.expiresAt,
      daysLeft: expired ? 0 : Math.ceil(msLeft / 86_400_000),
    };
  }
}
