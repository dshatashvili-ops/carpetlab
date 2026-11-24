import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { Roles } from '../common/roles.guard';
import { EmployeesService } from './employees.service';

@Roles('OWNER')
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}

  @Post()
  async invite(@Req() req: Request, @Body() body: { email: string; role: Role }): Promise<{ ok: true }> {
    await this.employees.invite(req.auth!.orgId, body.email, body.role);
    return { ok: true };
  }

  @Get()
  list(@Req() req: Request) {
    return this.employees.list(req.auth!.orgId);
  }

  @Patch(':id')
  setRole(@Req() req: Request, @Param('id') id: string, @Body() body: { role: Role }) {
    return this.employees.setRole(req.auth!.orgId, id, body.role);
  }

  @Delete(':id') @HttpCode(204)
  async remove(@Req() req: Request, @Param('id') id: string): Promise<void> {
    await this.employees.remove(req.auth!.orgId, id);
  }
}
