/**
 * Klien API. Access token hanya di memori (K-11 frontend); refresh lewat
 * cookie HttpOnly. Header konteks cabang/periode ditambahkan oleh store.
 */
export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly details?: unknown, public readonly requestId?: string) {
    super(message);
  }
}

type Ctx = () => { token: string | null; branch: string; period: string | null };
let ctx: Ctx = () => ({ token: null, branch: 'ALL', period: null });
let refreshing: Promise<string | null> | null = null;
let onUnauthenticated: () => void = () => undefined;
let onRefreshed: (token: string, user: unknown) => void = () => undefined;

export function configureApi(opts: { ctx: Ctx; onUnauthenticated: () => void; onRefreshed: (token: string, user: unknown) => void }) {
  ctx = opts.ctx; onUnauthenticated = opts.onUnauthenticated; onRefreshed = opts.onRefreshed;
}

const BASE = '/api/v1';

async function parse(res: Response) {
  const text = await res.text();
  try { return text ? JSON.parse(text) : null; } catch { return text; }
}

export async function refreshToken(): Promise<string | null> {
  if (!refreshing) {
    refreshing = (async () => {
      const res = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'same-origin' });
      if (!res.ok) return null;
      const body = await res.json();
      onRefreshed(body.access_token, body.user);
      return body.access_token as string;
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

export async function api<T = any>(path: string, init: RequestInit & { retry?: boolean; scoped?: boolean } = {}): Promise<T> {
  const { token, branch, period } = ctx();
  const headers: Record<string, string> = { Accept: 'application/json', ...(init.headers as Record<string, string> | undefined) };
  if (init.body && !(init.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (init.scoped !== false) { headers['X-Branch-Id'] = branch; if (period) headers['X-Period-Id'] = period; }
  if (init.method && init.method !== 'GET') headers['Idempotency-Key'] = crypto.randomUUID();
  const res = await fetch(BASE + path, { ...init, headers, credentials: 'same-origin' });
  if (res.status === 401 && init.retry !== false && !path.startsWith('/auth/')) {
    const t = await refreshToken();
    if (t) return api<T>(path, { ...init, retry: false });
    onUnauthenticated();
  }
  const body = await parse(res);
  if (!res.ok) {
    const e = body?.error ?? {};
    throw new ApiError(res.status, e.code ?? 'ERROR', e.message ?? `Permintaan gagal (${res.status})`, e.details, e.request_id);
  }
  return body as T;
}

export const get = <T = any>(path: string, opts?: { scoped?: boolean }) => api<T>(path, { method: 'GET', ...opts });
export const post = <T = any>(path: string, body?: unknown, opts?: { scoped?: boolean }) => api<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body), ...opts });
export const patch = <T = any>(path: string, body?: unknown) => api<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
