import type { PaginationMeta } from '@ledgerloop/shared-types';

/** Return this from a controller to get `data` + pagination `meta` in the envelope. */
export class Paginated<T> {
  readonly meta: PaginationMeta;

  constructor(
    readonly items: T[],
    total: number,
    page: number,
    limit: number,
  ) {
    this.meta = { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
  }
}
