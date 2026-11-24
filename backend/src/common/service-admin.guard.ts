import { CanActivate, ExecutionContext, ForbiddenException, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

export const SERVICE_ADMIN_KEY = 'serviceAdmin';
/** Only operators of the CarpetLAB service itself (User.isServiceAdmin), never organization owners. */
export const ServiceAdmin = (): MethodDecorator & ClassDecorator => SetMetadata(SERVICE_ADMIN_KEY, true);

@Injectable()
export class ServiceAdminGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (!this.reflector.getAllAndOverride<boolean>(SERVICE_ADMIN_KEY, [ctx.getHandler(), ctx.getClass()])) return true;
    if (!ctx.switchToHttp().getRequest<Request>().auth?.isServiceAdmin) throw new ForbiddenException('Только для администратора сервиса');
    return true;
  }
}
