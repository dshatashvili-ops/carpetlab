import { Body, Controller, Get, HttpCode, Post, Query, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { Public } from '../common/public.decorator';
import { SESSION_COOKIE } from './auth.guard';
import { AuthService } from './auth.service';

const cookieOpts = { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', maxAge: 30 * 86_400_000, path: '/' };

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public() @Post('register')
  async register(@Body() body: { email?: string; password?: string; orgName?: string }, @Res({ passthrough: true }) res: Response): Promise<{ ok: true }> {
    const { token } = await this.auth.register(body);
    res.cookie(SESSION_COOKIE, token, cookieOpts);
    return { ok: true };
  }

  @Public() @Post('login') @HttpCode(200)
  async login(@Body() body: { email: string; password: string }, @Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ ok: true }> {
    const { token } = await this.auth.login(body.email, body.password, req.ip ?? 'unknown');
    res.cookie(SESSION_COOKIE, token, cookieOpts);
    return { ok: true };
  }

  @Public() @Post('accept-invite')
  async acceptInvite(@Body() body: { token: string; password: string }, @Res({ passthrough: true }) res: Response): Promise<{ ok: true }> {
    const { token } = await this.auth.acceptInvite(body.token, body.password);
    res.cookie(SESSION_COOKIE, token, cookieOpts);
    return { ok: true };
  }

  @Post('logout') @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req.cookies?.[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { path: '/' });
  }

  @Public() @Get('verify')
  async verify(@Query('token') token: string): Promise<{ ok: true }> {
    await this.auth.verifyEmail(token);
    return { ok: true };
  }

  @Get('me')
  me(@Req() req: Request): { userId: string; orgId: string; role: string; emailVerified: boolean; isServiceAdmin: boolean } {
    const { userId, orgId, role, emailVerified, isServiceAdmin } = req.auth!;
    return { userId, orgId, role, emailVerified, isServiceAdmin };
  }
}
