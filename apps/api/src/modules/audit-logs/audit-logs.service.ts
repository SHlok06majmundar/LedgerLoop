import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type ClientSession, type FilterQuery, type Model } from 'mongoose';
import { RequestContext } from '../../common/context/request-context';
import { Paginated } from '../../common/http/paginated';
import { AuditLog } from './audit-log.schema';

export interface AuditEntry {
  organizationId: string | Types.ObjectId;
  action: string;
  entityType: string;
  entityId: string | Types.ObjectId;
  before?: unknown;
  after?: unknown;
  /** Defaults to the authenticated caller of the current request. */
  userId?: string | null;
}

export interface AuditQuery {
  page: number;
  limit: number;
  entityType?: string;
  entityId?: string;
  action?: string;
}

/** Writes audit records; there is deliberately no edit or delete. */
@Injectable()
export class AuditLogsService {
  constructor(@InjectModel(AuditLog.name) private readonly logs: Model<AuditLog>) {}

  /** Pass the transaction session so the audit row commits with the change it records. */
  async record(entry: AuditEntry, session?: ClientSession): Promise<void> {
    const ctx = RequestContext.get();
    const userId = entry.userId === undefined ? ctx?.userId : entry.userId;
    await this.logs.create(
      [
        {
          organizationId: new Types.ObjectId(entry.organizationId),
          userId: userId ? new Types.ObjectId(userId) : null,
          action: entry.action,
          entityType: entry.entityType,
          entityId: new Types.ObjectId(entry.entityId),
          before: snapshot(entry.before),
          after: snapshot(entry.after),
          requestId: ctx?.requestId,
          ip: ctx?.ip,
        },
      ],
      { session },
    );
  }

  async list(organizationId: string, query: AuditQuery): Promise<Paginated<unknown>> {
    const filter: FilterQuery<AuditLog> = { organizationId };
    if (query.entityType) filter.entityType = query.entityType;
    if (query.entityId) filter.entityId = query.entityId;
    if (query.action) filter.action = query.action;

    const [items, total] = await Promise.all([
      this.logs
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((query.page - 1) * query.limit)
        .limit(query.limit)
        .populate('userId', 'name email')
        .exec(),
      this.logs.countDocuments(filter),
    ]);
    return new Paginated(
      items.map((i) => i.toJSON()),
      total,
      query.page,
      query.limit,
    );
  }
}

/** Stores plain JSON so later document changes cannot alter the snapshot. */
function snapshot(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  const plain =
    typeof value === 'object' && value !== null && 'toJSON' in value
      ? (value as { toJSON: () => unknown }).toJSON()
      : value;
  return JSON.parse(JSON.stringify(plain)) as unknown;
}
