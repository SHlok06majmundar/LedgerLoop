import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Types, type FilterQuery, type Model } from 'mongoose';
import { notFound } from '../../common/errors/app-exception';
import { paginate } from '../../database/paginate';
import { Notification } from './notification.schema';

export interface NotifyInput {
  organizationId?: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name) private readonly notifications: Model<Notification>,
  ) {}

  async notify(userId: string | Types.ObjectId, input: NotifyInput): Promise<void> {
    await this.notifications.create({
      userId: new Types.ObjectId(userId),
      organizationId: input.organizationId ? new Types.ObjectId(input.organizationId) : undefined,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link,
    });
  }

  async list(userId: string, query: { page: number; limit: number; unread?: boolean }) {
    const filter: FilterQuery<Notification> = { userId };
    if (query.unread) filter.readAt = null;
    const [page, unread] = await Promise.all([
      paginate(
        this.notifications,
        filter,
        { ...query, order: 'desc' },
        { defaultSort: 'createdAt' },
      ),
      this.notifications.countDocuments({ userId, readAt: null }),
    ]);
    return Object.assign(page, { meta: { ...page.meta, unread } });
  }

  async markRead(userId: string, notificationId: string) {
    const notification = await this.notifications
      .findOneAndUpdate({ _id: notificationId, userId }, { readAt: new Date() }, { new: true })
      .exec();
    if (!notification) throw notFound('Notification');
    return notification;
  }

  async markAllRead(userId: string) {
    const result = await this.notifications.updateMany(
      { userId, readAt: null },
      { readAt: new Date() },
    );
    return { updated: result.modifiedCount };
  }
}
