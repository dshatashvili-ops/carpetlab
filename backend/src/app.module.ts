import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { OrgsModule } from './orgs/orgs.module';
import { CommonModule } from './common/common.module';
import { HealthController } from './health.controller';

@Module({ imports: [CommonModule, AuthModule, OrgsModule], controllers: [HealthController] })
export class AppModule {}
