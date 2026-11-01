import type { PaginationMeta } from '@ledgerloop/shared-types';
import { readOrganizationId, readRefreshToken, useSession, type SessionUser } from './session';

export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://10.0.2.2:4000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly errorCode: string,
    message: string,
  ) {
    super(message);
  }
}

export interface Page<T> {
  items: T[];
  meta: PaginationMeta & { unread?: number };
}

interface Options {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  noOrg?: boolean;
  idempotencyKey?: string;
}

interface AuthPayload {
  user: SessionUser;
  accessToken: string;
  refreshToken: string;
}

const MOBILE = { 'X-Client': 'mobile' };
let refreshing: Promise<boolean> | null = null;
/** Bumped on sign-out so late refresh responses are discarded. */
let sessionGeneration = 0;

/** Exchanges the stored refresh token (rotating it) for a new access token. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    const generation = sessionGeneration;
    try {
      const refreshToken = await readRefreshToken();
      if (!refreshToken) return false;
      const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { ...MOBILE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      // Signed out while this refresh was in flight: do not bring the session back.
      if (generation !== sessionGeneration) return false;
      if (!res.ok) {
        await useSession.getState().clear();
        return false;
      }
      const { data } = (await res.json()) as { data: AuthPayload };
      if (generation !== sessionGeneration) return false;
      await useSession.getState().setSession(data.accessToken, data.user, data.refreshToken);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

/** Restores a session at app start; resolves whether the user is signed in. */
export async function restoreSession(): Promise<boolean> {
  const organizationId = await readOrganizationId();
  if (organizationId) useSession.setState({ organizationId });
  return refreshSession();
}

export async function signIn(email: string, password: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { ...MOBILE, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json();
  if (!res.ok) throw new ApiError(res.status, body.errorCode, body.message);
  const data = body.data as AuthPayload;
  await useSession.getState().setSession(data.accessToken, data.user, data.refreshToken);
}

export async function signUp(name: string, email: string, password: string): Promise<void> {
  const res = await fetch(`${API_URL}/api/v1/auth/register`, {
    method: 'POST',
    headers: { ...MOBILE, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });
  const body = await res.json();
  if (!res.ok) {
    const detail = Array.isArray(body.details) ? body.details[0]?.message : undefined;
    throw new ApiError(res.status, body.errorCode, detail ?? body.message);
  }
  const data = body.data as AuthPayload;
  await useSession.getState().setSession(data.accessToken, data.user, data.refreshToken);
}

export async function signOut(): Promise<void> {
  // Let a refresh that is already running finish so the server revokes the current token.
  if (refreshing) await refreshing;
  const refreshToken = await readRefreshToken();
  try {
    await api('/auth/logout', { method: 'POST', body: { refreshToken }, noOrg: true });
  } catch {
    // Already signed out on the server; clearing the device is what matters.
  }
  sessionGeneration++;
  await useSession.getState().clear();
}

function url(path: string, query?: Options['query']) {
  const params = Object.entries(query ?? {})
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `${API_URL}/api/v1${path}${params ? `?${params}` : ''}`;
}

async function send(path: string, options: Options) {
  const { accessToken, organizationId } = useSession.getState();
  const headers: Record<string, string> = { ...MOBILE };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (organizationId && !options.noOrg) headers['X-Organization-Id'] = organizationId;
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  return fetch(url(path, options.query), {
    method: options.method ?? 'GET',
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
}

async function request(path: string, options: Options) {
  let res = await send(path, options);
  if (res.status === 401 && !path.startsWith('/auth/') && (await refreshSession())) {
    res = await send(path, options);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    // Validation errors carry the field-level reason in `details`; show the first one.
    const detail = Array.isArray(body?.details) ? body.details[0] : undefined;
    const message = detail?.message ? `${detail.field ? `${detail.field}: ` : ''}${detail.message}` : body?.message;
    throw new ApiError(res.status, body?.errorCode ?? 'NETWORK_ERROR', message ?? 'Something went wrong');
  }
  return body;
}

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  return (await request(path, options)).data as T;
}

export async function apiPage<T>(path: string, options: Options = {}): Promise<Page<T>> {
  const body = await request(path, options);
  return { items: body.data as T[], meta: body.meta };
}

/** Random key for idempotent financial writes. */
export function newIdempotencyKey(): string {
  return `m-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 12)}`;
}
