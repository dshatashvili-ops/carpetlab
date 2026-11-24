import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { Mailer } from '../common/mailer';
import { PrismaService } from '../common/prisma.service';

const ROLES: Role[] = ['OWNER', 'OPERATOR', 'CUTTER'];
const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService, private readonly mailer: Mailer) {}

  async invite(orgId: string, emailRaw: string, role: Role): Promise<void> {
    const email = (emailRaw ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Некорректный e-mail');
    if (!ROLES.includes(role)) throw new BadRequestException('Неизвестная роль');
    const existing = await this.prisma.membership.findFirst({ where: { orgId, user: { email } } });
    if (existing) throw new ConflictException('Этот сотрудник уже в организации');
    const token = randomBytes(24).toString('hex');
    await this.prisma.emailToken.create({
      data: { kind: 'INVITE', email, orgId, role, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 7 * 86_400_000) },
    });
    await this.mailer.send(email, 'Приглашение в CarpetLAB', `<p>Вас пригласили в CarpetLAB. Перейдите по ссылке: /accept-invite?token=${token}</p>`);
  }

  async list(orgId: string): Promise<{ members: { id: string; userId: string; email: string; role: Role }[]; pendingInvites: { email: string; role: Role | null }[] }> {
    const members = await this.prisma.membership.findMany({ where: { orgId }, include: { user: true }, orderBy: { user: { createdAt: 'asc' } } });
    const invites = await this.prisma.emailToken.findMany({ where: { orgId, kind: 'INVITE', usedAt: null, expiresAt: { gt: new Date() } } });
    return {
      members: members.map((m) => ({ id: m.id, userId: m.userId, email: m.user.email, role: m.role })),
      pendingInvites: invites.map((i) => ({ email: i.email, role: i.role })),
    };
  }

  async setRole(orgId: string, id: string, role: Role): Promise<{ id: string; role: Role }> {
    if (!ROLES.includes(role)) throw new BadRequestException('Неизвестная роль');
    const m = await this.find(orgId, id);
    if (m.role === 'OWNER' && role !== 'OWNER') await this.assertNotLastOwner(orgId);
    const updated = await this.prisma.membership.update({ where: { id }, data: { role } });
    return { id: updated.id, role: updated.role };
  }

  async remove(orgId: string, id: string): Promise<void> {
    const m = await this.find(orgId, id);
    if (m.role === 'OWNER') await this.assertNotLastOwner(orgId);
    await this.prisma.$transaction([
      this.prisma.session.deleteMany({ where: { userId: m.userId, orgId } }),
      this.prisma.membership.delete({ where: { id } }),
    ]);
  }

  private async find(orgId: string, id: string) {
    const m = await this.prisma.membership.findFirst({ where: { id, orgId } });
    if (!m) throw new NotFoundException();
    return m;
  }

  private async assertNotLastOwner(orgId: string): Promise<void> {
    const owners = await this.prisma.membership.count({ where: { orgId, role: 'OWNER' } });
    if (owners <= 1) throw new ConflictException('Нельзя убрать последнего владельца');
  }
}
