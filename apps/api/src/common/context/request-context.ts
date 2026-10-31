import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export interface RequestContextData {
  requestId: string;
  userId?: string;
  organizationId?: string;
  ip?: string;
  userAgent?: string;
}

const storage = new AsyncLocalStorage<RequestContextData>();
const SAFE_REQUEST_ID = /^[\w.:-]{1,100}$/;

/** Per-request data (correlation id, caller) readable from any service. */
export const RequestContext = {
  get(): RequestContextData | undefined {
    return storage.getStore();
  },

  /** Runs background work (jobs, schedulers) with its own correlation id. */
  run<T>(data: Partial<RequestContextData>, fn: () => T): T {
    return storage.run({ requestId: randomUUID(), ...data }, fn);
  },

  set(values: Partial<RequestContextData>): void {
    const store = storage.getStore();
    if (store) Object.assign(store, values);
  },
};

export function requestContextMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-request-id');
  const requestId = incoming && SAFE_REQUEST_ID.test(incoming) ? incoming : randomUUID();
  (req as Request & { id: string }).id = requestId;
  res.setHeader('X-Request-Id', requestId);
  storage.run({ requestId, ip: req.ip, userAgent: req.header('user-agent') }, next);
}
