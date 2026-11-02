import type { PaginationMeta } from '@ledgerloop/shared-types';
import { markSlow, unmarkSlow } from './connection';
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
/** A sleeping server needs up to a minute to wake, so give up only after that. */
const TIMEOUT_MS = 75_000;
/** After this long a request counts as slow and the app says why it is waiting. */
const SLOW_AFTER_MS = 4_000;

/** fetch with a time limit; network failures become an ApiError with a message people understand. */
async function http(input: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let slow = false;
  const slowTimer = setTimeout(() => {
    slow = true;
    markSlow();
  }, SLOW_AFTER_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      controller.signal.aborted
        ? 'LedgerLoop is taking too long to answer. Check your internet connection and try again.'
        : 'Could not reach LedgerLoop. Check your internet connection and try again.',
    );
  } finally {
    clearTimeout(timeout);
    clearTimeout(slowTimer);
    if (slow) unmarkSlow();
  }
}

/** Reads a JSON reply; a server that is still starting answers with an HTML error page. */
async function readJson(res: Response) {
  const body = await res.json().catch(() => null);
  if (!res.ok || !body) {
    // Validation errors carry the field-level reason in `details`; show the first one.
    const detail = Array.isArray(body?.details) ? body.details[0] : undefined;
    const message = detail?.message ? `${detail.field ? `${detail.field}: ` : ''}${detail.message}` : body?.message;
    throw new ApiError(
      res.status,
      body?.errorCode ?? 'SERVER_UNAVAILABLE',
      message ?? 'LedgerLoop is starting up. Please try again in a moment.',
    );
  }
  return body;
}

/** Wakes the server while the user is still typing, so signing in is quick. */
export function warmUp(): void {
  http(`${API_URL}/health`).catch(() => undefined);
}

export type RestoreOutcome = 'signed-in' | 'signed-out' | 'offline';

let refreshing: Promise<RestoreOutcome> | null = null;
/** Bumped on sign-out so late refresh responses are discarded. */
let sessionGeneration = 0;

/** Exchanges the stored refresh token (rotating it) for a new access token. */
function refresh(): Promise<RestoreOutcome> {
  refreshing ??= (async (): Promise<RestoreOutcome> => {
    const generation = sessionGeneration;
    try {
      const refreshToken = await readRefreshToken();
      if (!refreshToken) return 'signed-out';
      const res = await http(`${API_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { ...MOBILE, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      // Signed out while this refresh was in flight: do not bring the session back.
      if (generation !== sessionGeneration) return 'signed-out';
      // A refused token (expired, revoked, account disabled) means signing in again.
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        await useSession.getState().clear();
        return 'signed-out';
      }
      const { data } = (await readJson(res)) as { data: AuthPayload };
      if (generation !== sessionGeneration) return 'signed-out';
      await useSession.getState().setSession(data.accessToken, data.user, data.refreshToken);
      return 'signed-in';
    } catch {
      // Unreachable or still starting: keep the stored login so the user can retry.
      return 'offline';
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

export async function refreshSession(): Promise<boolean> {
  return (await refresh()) === 'signed-in';
}

/** Restores a session at app start. */
export async function restoreSession(): Promise<RestoreOutcome> {
  const organizationId = await readOrganizationId();
  if (organizationId) useSession.setState({ organizationId });
  return refresh();
}

/**
 * Picks the business to open before the session is published, so a returning
 * user lands straight on it instead of passing through business setup.
 */
async function chooseOrganization(accessToken: string): Promise<void> {
  const res = await http(`${API_URL}/api/v1/organizations`, {
    headers: { ...MOBILE, Authorization: `Bearer ${accessToken}` },
  });
  const memberships = (await readJson(res)).data as { organization: { id: string } }[];
  const current = await readOrganizationId();
  if (memberships.some((m) => m.organization.id === current)) return;
  await useSession.getState().setOrganization(memberships[0]?.organization.id ?? null);
}

export async function signIn(email: string, password: string): Promise<void> {
  const res = await http(`${API_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { ...MOBILE, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = (await readJson(res)).data as AuthPayload;
  await chooseOrganization(data.accessToken);
  await useSession.getState().setSession(data.accessToken, data.user, data.refreshToken);
}

export async function signUp(name: string, email: string, password: string): Promise<void> {
  const res = await http(`${API_URL}/api/v1/auth/register`, {
    method: 'POST',
    headers: { ...MOBILE, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });
  const data = (await readJson(res)).data as AuthPayload;
  // A new account has no business yet; forget one left behind by a previous account.
  await useSession.getState().setOrganization(null);
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
  return http(url(path, options.query), {
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
  return readJson(res);
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
