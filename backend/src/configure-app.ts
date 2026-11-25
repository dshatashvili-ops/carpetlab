import { INestApplication } from '@nestjs/common';
import cookieParser from 'cookie-parser';

export function configureApp(app: INestApplication): void {
  // behind nginx/Caddy the client address comes from X-Forwarded-For (needed by the login rate limiter)
  (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void }).set('trust proxy', 1);
  app.setGlobalPrefix('api');
  app.use(cookieParser());
}
