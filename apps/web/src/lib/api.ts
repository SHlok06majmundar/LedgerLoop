import type { ApiError as ApiErrorBody, PaginationMeta } from '@ledgerloop/shared-types';
import { useSession } from './session';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly errorCode: string,
    message: string,
    readonly details: unknown = null,
  ) {
    super(message);
  }

  /** Field-level messages from VALIDATION_FAILED responses, keyed by field path. */
  get fieldErrors(): Record<string, string> {
    if (!Array.isArray(this.details)) return {};
    return Object.fromEntries(
      (this.details as { field: string; message: string }[]).map((d) => [d.field, d.message]),
    );
  }
}

export interface Page<T> {
  items: T[];
  meta: PaginationMeta & { unread?: number };
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Send without the organization header (auth, organization list). */
  noOrg?: boolean;
  idempotencyKey?: string;
  signal?: AbortSignal;
}

let refreshing: Promise<boolean> | null = null;

/** Exchanges the httpOnly refresh cookie for a new access token, once at a time. */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        useSession.getState().clear();
        return false;
      }
      const body = await res.json();
      useSession.getState().setAuth(body.data.accessToken, body.data.user);
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

function buildUrl(path: string, query?: RequestOptions['query']) {
  const url = new URL(`${API_URL}/api/v1${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function send(path: string, options: RequestOptions, isFormData: boolean): Promise<Response> {
  const { accessToken, organizationId } = useSession.getState();
  const headers: Record<string, string> = {};
  if (!isFormData && options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  if (organizationId && !options.noOrg) headers['X-Organization-Id'] = organizationId;
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  return fetch(buildUrl(path, options.query), {
    method: options.method ?? 'GET',
    headers,
    credentials: 'include',
    signal: options.signal,
    body: isFormData
      ? (options.body as FormData)
      : options.body !== undefined
        ? JSON.stringify(options.body)
        : undefined,
  });
}

async function request(path: string, options: RequestOptions = {}): Promise<Response> {
  const isFormData = options.body instanceof FormData;
  let res = await send(path, options, isFormData);
  if (res.status === 401 && !path.startsWith('/auth/')) {
    if (await refreshSession()) res = await send(path, options, isFormData);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiError(
      res.status,
      body?.errorCode ?? 'NETWORK_ERROR',
      body?.message ?? 'Something went wrong. Please try again.',
      body?.details ?? null,
    );
  }
  return res;
}

/** JSON request returning the envelope's `data`. */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await request(path, options);
  const body = await res.json();
  return body.data as T;
}

/** Paginated list request returning items and meta. */
export async function apiPage<T>(path: string, options: RequestOptions = {}): Promise<Page<T>> {
  const res = await request(path, options);
  const body = await res.json();
  return { items: body.data as T[], meta: body.meta };
}

/** Downloads a file response (PDF, CSV) and saves it in the browser. */
export async function download(path: string, fallbackName: string): Promise<void> {
  const res = await request(path);
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') ?? '';
  const name = disposition.match(/filename="?([^"]+)"?/)?.[1] ?? fallbackName;
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  URL.revokeObjectURL(url);
}

/** Fetches a protected image (e.g. organization logo) as an object URL. */
export async function blobUrl(path: string): Promise<string | null> {
  try {
    const res = await request(path);
    return URL.createObjectURL(await res.blob());
  } catch {
    return null;
  }
}

export const newIdempotencyKey = () => crypto.randomUUID();
