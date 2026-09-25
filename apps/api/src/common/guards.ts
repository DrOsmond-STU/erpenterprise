import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthService } from '../auth/auth.service.js';
import { AppRequest, PERMISSION_KEY, PUBLIC_KEY } from './context.js';
import { forbidden } from './errors.js';

/** K-05/K-13: setiap endpoint (kecuali @Public) memerlukan access token yang sah. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly auth: AuthService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const header = req.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) throw new UnauthorizedException('Token akses tidak ada.');
    req.user = await this.auth.userFromAccessToken(token);
    return true;
  }
}

/** K-10/K-13: izin granular per aksi, ditegakkan di server. */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSION_KEY, [ctx.getHandler(), ctx.getClass()]);
    if (!required || !required.length) return true;
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    if (!req.user) return false;
    const missing = required.filter((p) => !req.user!.permissions.has(p));
    if (missing.length) throw forbidden(`Memerlukan izin ${missing.join(', ')}.`);
    return true;
  }
}

/**
 * K-11: konteks cabang dari header X-Branch-Id; 'ALL' hanya untuk pemegang
 * report.consolidated atau peran lintas cabang. Periode dari X-Period-Id.
 */
@Injectable()
export class BranchContextGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const user = req.user!;
    const raw = String(req.headers['x-branch-id'] ?? '').trim().toUpperCase();
    const period = String(req.headers['x-period-id'] ?? '').trim() || null;
    if (period && !/^[0-9A-Z-]{4,12}$/.test(period)) throw forbidden('Periode tidak sah.');

    if (!raw || raw === 'ALL') {
      const allowedAll = user.branches === '*' || user.permissions.has('report.consolidated');
      if (!allowedAll) throw forbidden('Konteks "Semua cabang" memerlukan izin laporan konsolidasi.');
      req.scope = { branch: 'ALL', rlsBranches: user.branches, period };
      return true;
    }
    if (!/^[A-Z]{3}$/.test(raw)) throw forbidden('Kode cabang tidak sah.');
    if (user.branches !== '*' && !user.branches.includes(raw)) throw forbidden(`Anda tidak memiliki akses ke cabang ${raw}.`);
    req.scope = { branch: raw, rlsBranches: [raw], period };
    return true;
  }
}
