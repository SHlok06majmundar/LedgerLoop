import type { FilterQuery, Model, PopulateOptions, SortOrder } from 'mongoose';
import { Paginated } from '../common/http/paginated';

export interface PageRequest {
  page: number;
  limit: number;
  search?: string;
  sort?: string;
  order: 'asc' | 'desc';
}

export interface PaginateOptions {
  /** Fields matched case-insensitively against `search`. */
  searchFields?: string[];
  /** Fields a client may sort by; anything else falls back to `defaultSort`. */
  sortable?: string[];
  defaultSort?: string;
  populate?: PopulateOptions | PopulateOptions[];
}

export const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Runs a filtered, searched, sorted page query plus its total count. */
export async function paginate<T>(
  model: Model<T>,
  filter: FilterQuery<T>,
  page: PageRequest,
  options: PaginateOptions = {},
): Promise<Paginated<unknown>> {
  const query: FilterQuery<T> = { ...filter };
  if (page.search && options.searchFields?.length) {
    const pattern = new RegExp(escapeRegex(page.search), 'i');
    (query as Record<string, unknown>).$or = options.searchFields.map((field) => ({
      [field]: pattern,
    }));
  }

  const sortField =
    page.sort && options.sortable?.includes(page.sort)
      ? page.sort
      : (options.defaultSort ?? 'createdAt');
  const direction: SortOrder = page.order === 'asc' ? 1 : -1;

  let find = model
    .find(query)
    .sort({ [sortField]: direction, _id: direction })
    .skip((page.page - 1) * page.limit)
    .limit(page.limit);
  if (options.populate) find = find.populate(options.populate);

  const [items, total] = await Promise.all([find.exec(), model.countDocuments(query)]);
  return new Paginated(
    items.map((doc) => doc.toJSON()),
    total,
    page.page,
    page.limit,
  );
}
