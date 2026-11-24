import { Module } from '@nestjs/common';
import { EmployeesController } from './employees.controller';
import { EmployeesService } from './employees.service';
import { OrgSettingsController } from './org-settings.controller';

@Module({ controllers: [EmployeesController, OrgSettingsController], providers: [EmployeesService] })
export class OrgsModule {}
