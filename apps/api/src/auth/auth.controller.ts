import { Body, Controller, Delete, Get, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import { AuthService, LoginResult } from './auth.service.js';
import { ZodValidationPipe } from '../common/zod.pipe.js';
import { AppRequest, CurrentUser, Public, RequestUser } from '../common/context.js';
import { loadConfig } from '../config.js';
import { DbService, systemContext } from '../db/db.service.js';

const loginSchema = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(200) });
const REFRESH_COOKIE = 'erp_refresh';

@Controller()
export class AuthController {
  private readonly cfg = loadConfig();
  constructor(private readonly auth: AuthService, private readonly db: DbService) {}

  private setRefreshCookie(res: Response, r: LoginResult) {
    res.cookie(REFRESH_COOKIE, r.refreshToken, {
      httpOnly: true, secure: this.cfg.NODE_ENV === 'production', sameSite: 'strict', path: '/api/v1/auth', expires: r.refreshExpiresAt,
    });
  }
  private body(r: LoginResult) { return { access_token: r.accessToken, expires_in: r.expiresIn, user: r.user }; }
  private meta(req: AppRequest) { return { ip: req.ip, userAgent: req.headers['user-agent'], requestId: req.requestId }; }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('auth/login')
  @HttpCode(200)
  async login(@Body(new ZodValidationPipe(loginSchema)) body: z.infer<typeof loginSchema>, @Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const r = await this.auth.login(body.email, body.password, this.meta(req));
    this.setRefreshCookie(res, r);
    return this.body(r);
  }

  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })   // per IP; setiap muat ulang SPA memanggil refresh sekali
  @Post('auth/refresh')
  @HttpCode(200)
  async refresh(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies?.[REFRESH_COOKIE];
    const r = await this.auth.refresh(String(token ?? ''), this.meta(req));
    this.setRefreshCookie(res, r);
    return this.body(r);
  }

  @Public()
  @Post('auth/logout')
  @HttpCode(204)
  async logout(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response) {
    const header = req.headers.authorization ?? '';
    let user: RequestUser | undefined;
    if (header.startsWith('Bearer ')) user = await this.auth.userFromAccessToken(header.slice(7)).catch(() => undefined);
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE], user);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
  }

  @Get('me')
  async me(@CurrentUser() user: RequestUser) {
    const branches = await this.db.run(systemContext(user.companyId), async (c) =>
      (await c.query('SELECT code, name, short_name, type, city, is_head_office, status, target_monthly, main_bank_account_code, petty_cash_account_code FROM branches WHERE company_id = $1 ORDER BY is_head_office DESC, code', [user.companyId])).rows);
    const periods = await this.db.run(systemContext(user.companyId), async (c) =>
      (await c.query('SELECT code, label, date_from, date_to, period_group, status FROM fiscal_periods WHERE company_id = $1 ORDER BY date_from, date_to', [user.companyId])).rows);
    const company = await this.db.run(systemContext(user.companyId), async (c) => (await c.query('SELECT code, name FROM companies WHERE id = $1', [user.companyId])).rows[0]);
    return {
      user: { id: user.id, email: user.email, name: user.name, permissions: [...user.permissions].sort(), branches: user.branches },
      company,
      branches: branches.filter((b: any) => user.branches === '*' || user.branches.includes(String(b.code).trim())).map((b: any) => ({ ...b, code: String(b.code).trim() })),
      allBranches: user.branches === '*' || user.permissions.has('report.consolidated'),
      periods: periods.map((p: any) => ({ id: p.code, label: p.label, from: p.date_from, to: p.date_to, status: p.status, group: p.period_group })),
    };
  }

  @Get('me/sessions')
  sessions(@CurrentUser() user: RequestUser) { return this.auth.listSessions(user); }

  @Delete('me/sessions/:id')
  @HttpCode(204)
  revoke(@CurrentUser() user: RequestUser, @Param('id') id: string) { return this.auth.revokeSession(user, id); }
}
