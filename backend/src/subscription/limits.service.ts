import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { runInTenant } from '../common/tenant-context';
import { limitsFor } from './plans';

@Injectable()
export class LimitsService {
  constructor(private readonly prisma: PrismaService) {}

  private async plan(orgId: string): Promise<number> {
    const sub = await this.prisma.subscription.findUnique({ where: { orgId } });
    return sub?.plan ?? 1;
  }

  async assertCanAdd(orgId: string, what: 'article' | 'employee'): Promise<void> {
    const limits = limitsFor(await this.plan(orgId));
    if (what === 'article') {
      const used = await runInTenant(this.prisma, orgId, (tx) => tx.article.count());
      if (used >= limits.articles) throw new ConflictException({ code: 'LIMIT_REACHED', message: `Лимит артикулов тарифа: ${limits.articles}` });
      return;
    }
    const members = await this.prisma.membership.count({ where: { orgId } });
    const pending = await this.prisma.emailToken.count({ where: { orgId, kind: 'INVITE', usedAt: null, expiresAt: { gt: new Date() } } });
    if (members + pending >= limits.employees) throw new ConflictException({ code: 'LIMIT_REACHED', message: `Лимит сотрудников тарифа: ${limits.employees}` });
  }

  async assertPhotoQuota(orgId: string, addBytes: number): Promise<void> {
    const limits = limitsFor(await this.plan(orgId));
    const agg = await runInTenant(this.prisma, orgId, (tx) => tx.article.aggregate({ _sum: { photoBytes: true } }));
    if ((agg._sum.photoBytes ?? 0) + addBytes > limits.photoBytes) {
      throw new ConflictException({ code: 'QUOTA_REACHED', message: 'Исчерпан лимит хранилища фото' });
    }
  }
}
