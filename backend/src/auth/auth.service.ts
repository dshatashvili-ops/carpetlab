import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { appUrl } from '../common/app-url';
import { Mailer } from '../common/mailer';
import { PrismaService } from '../common/prisma.service';
import { AuthContext } from '../common/auth-context';
import { RateLimiter } from './rate-limiter';

const SESSION_DAYS = 30;
const TRIAL_DAYS = 7;
const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

@Injectable()
export class AuthService {
  private readonly loginLimiter = new RateLimiter(5, 60_000);

  constructor(private readonly prisma: PrismaService, private readonly mailer: Mailer) {}

  async register(input: { email?: string; password?: string; orgName?: string }): Promise<{ token: string }> {
    const email = (input.email ?? '').trim().toLowerCase();
    const orgName = (input.orgName ?? '').trim();
    if (!EMAIL_RE.test(email)) throw new BadRequestException('Некорректный e-mail');
    if ((input.password ?? '').length < 10) throw new BadRequestException('Пароль должен быть не короче 10 символов');
    if (!orgName) throw new BadRequestException('Укажите название организации');
    if (await this.prisma.user.findUnique({ where: { email } })) throw new ConflictException('Этот e-mail уже зарегистрирован');

    const passwordHash = await argon2.hash(input.password!);
    const verifyToken = randomBytes(24).toString('hex');
    const sessionToken = randomBytes(32).toString('hex');
    const now = Date.now();

    await this.prisma.$transaction(async (tx) => {
      const org = await tx.organization.create({ data: { name: orgName } });
      const user = await tx.user.create({ data: { email, passwordHash } });
      await tx.membership.create({ data: { userId: user.id, orgId: org.id, role: 'OWNER' } });
      await tx.subscription.create({ data: { orgId: org.id, plan: 1, status: 'TRIAL', expiresAt: new Date(now + TRIAL_DAYS * 86_400_000) } });
      await tx.emailToken.create({ data: { kind: 'VERIFY', email, userId: user.id, tokenHash: sha256(verifyToken), expiresAt: new Date(now + 2 * 86_400_000) } });
      await tx.session.create({ data: { id: sha256(sessionToken), userId: user.id, orgId: org.id, expiresAt: new Date(now + SESSION_DAYS * 86_400_000) } });
    });

    await this.mailer.send(email, 'Подтвердите e-mail в CarpetLAB', `<p>Подтвердите e-mail, перейдя по ссылке: <a href="${appUrl(`/api/auth/verify?token=${verifyToken}`)}">${appUrl(`/api/auth/verify?token=${verifyToken}`)}</a></p>`);
    return { token: sessionToken };
  }

  async login(email: string, password: string, ip: string): Promise<{ token: string }> {
    const key = `${ip}|${(email ?? '').toLowerCase()}`;
    if (!this.loginLimiter.attempt(key)) throw new HttpException('Слишком много попыток входа, попробуйте через минуту', HttpStatus.TOO_MANY_REQUESTS);
    const user = await this.prisma.user.findUnique({ where: { email: (email ?? '').trim().toLowerCase() }, include: { memberships: true } });
    const ok = user ? await argon2.verify(user.passwordHash, password ?? '') : false;
    if (!user || !ok || user.memberships.length === 0) throw new UnauthorizedException('Неверный e-mail или пароль');
    const token = randomBytes(32).toString('hex');
    await this.prisma.session.create({
      data: { id: sha256(token), userId: user.id, orgId: user.memberships[0].orgId, expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000) },
    });
    return { token };
  }

  async acceptInvite(tokenRaw: string, password: string): Promise<{ token: string }> {
    const row = await this.prisma.emailToken.findUnique({ where: { tokenHash: sha256(tokenRaw ?? '') } });
    if (!row || row.kind !== 'INVITE' || row.usedAt || row.expiresAt < new Date() || !row.orgId || !row.role) {
      throw new BadRequestException('Приглашение недействительно или устарело');
    }
    let user = await this.prisma.user.findUnique({ where: { email: row.email } });
    if (user) {
      if (!(await argon2.verify(user.passwordHash, password ?? ''))) throw new UnauthorizedException('Неверный пароль');
    } else {
      if ((password ?? '').length < 10) throw new BadRequestException('Пароль должен быть не короче 10 символов');
      user = await this.prisma.user.create({ data: { email: row.email, passwordHash: await argon2.hash(password), emailVerifiedAt: new Date() } });
    }
    const token = randomBytes(32).toString('hex');
    await this.prisma.$transaction([
      this.prisma.membership.upsert({ where: { userId_orgId: { userId: user.id, orgId: row.orgId } }, create: { userId: user.id, orgId: row.orgId, role: row.role }, update: { role: row.role } }),
      this.prisma.emailToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
      this.prisma.session.create({ data: { id: sha256(token), userId: user.id, orgId: row.orgId, expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000) } }),
    ]);
    return { token };
  }

  async logout(token: string | undefined): Promise<void> {
    if (token) await this.prisma.session.deleteMany({ where: { id: sha256(token) } });
  }

  async verifyEmail(token: string): Promise<void> {
    const row = await this.prisma.emailToken.findUnique({ where: { tokenHash: sha256(token ?? '') } });
    if (!row || row.kind !== 'VERIFY' || row.usedAt || row.expiresAt < new Date() || !row.userId) {
      throw new BadRequestException('Ссылка недействительна или устарела');
    }
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: row.userId }, data: { emailVerifiedAt: new Date() } }),
      this.prisma.emailToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    ]);
  }

  async authenticate(token: string | undefined): Promise<AuthContext | null> {
    if (!token) return null;
    const session = await this.prisma.session.findUnique({ where: { id: sha256(token) } });
    if (!session || session.expiresAt < new Date()) return null;
    const m = await this.prisma.membership.findUnique({
      where: { userId_orgId: { userId: session.userId, orgId: session.orgId } },
      include: { user: true },
    });
    if (!m) return null;
    return { userId: m.userId, orgId: m.orgId, role: m.role, emailVerified: !!m.user.emailVerifiedAt, isServiceAdmin: m.user.isServiceAdmin };
  }
}
