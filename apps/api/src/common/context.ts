import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

/** Pengguna terautentikasi yang dilekatkan ke permintaan oleh JwtAuthGuard. */
export interface RequestUser {
  id: string;
  email: string;
  name: string;
  companyId: string;
  permissions: Set<string>;
  /** Kode cabang yang diizinkan; '*' = seluruh cabang. */
  branches: '*' | string[];
  sessionId: string;
}

/** Konteks cabang & periode dari header, sudah divalidasi terhadap hak pengguna. */
export interface ScopeContext {
  branch: string | 'ALL';
  /** Untuk RLS: '*' atau daftar kode cabang yang boleh dibaca. */
  rlsBranches: '*' | string[];
  period: string | null;
}

export type AppRequest = Request & { user?: RequestUser; scope?: ScopeContext; requestId: string };

export const PERMISSION_KEY = 'erp:permission';
export const RequirePermission = (...perms: string[]) => SetMetadata(PERMISSION_KEY, perms);

export const PUBLIC_KEY = 'erp:public';
export const Public = () => SetMetadata(PUBLIC_KEY, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestUser => {
  return ctx.switchToHttp().getRequest<AppRequest>().user!;
});

export const Scope = createParamDecorator((_: unknown, ctx: ExecutionContext): ScopeContext => {
  return ctx.switchToHttp().getRequest<AppRequest>().scope!;
});

export const ReqId = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  return ctx.switchToHttp().getRequest<AppRequest>().requestId;
});
