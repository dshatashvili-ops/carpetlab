import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { SubscriptionService } from './subscription.service';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);
const ALWAYS_OPEN = ['/api/auth/', '/api/billing/', '/api/admin/', '/api/cuts/calculate'];

/** Read-only mode: after the subscription ends every write except auth/billing/admin is refused with 402. */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private readonly subs: SubscriptionService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.auth || SAFE.has(req.method)) return true;
    if (ALWAYS_OPEN.some((p) => req.path.startsWith(p))) return true;
    const { status } = await this.subs.getStatus(req.auth.orgId);
    if (status === 'EXPIRED') {
      throw new HttpException({ code: 'SUBSCRIPTION_EXPIRED', message: 'Подписка закончилась: доступен только просмотр' }, HttpStatus.PAYMENT_REQUIRED);
    }
    return true;
  }
}
