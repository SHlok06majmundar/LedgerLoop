import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { NotificationStatus } from '@ledgerloop/shared-types';
import type {
  CollectionSettingsInput,
  CreateReminderInput,
  ListRemindersQuery,
  UpdateReminderInput,
} from '@ledgerloop/validation';
import type { FilterQuery, Model } from 'mongoose';
import { notFound, unprocessable } from '../../common/errors/app-exception';
import { paginate } from '../../database/paginate';
import { JobQueue } from '../../jobs/job-queue.service';
import { ScheduledJob } from '../../scheduler/scheduled-tasks';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { Communication, CommunicationKind } from '../communications/communication.schema';
import { CommunicationsService, DELIVER_JOB } from '../communications/communications.service';
import { Customer } from '../customers/customer.schema';
import { todayIn } from '../invoices/domain/invoice-status';
import { Invoice } from '../invoices/invoice.schema';
import { OPEN_STATUSES } from '../invoices/invoices.service';
import { Organization } from '../organizations/schemas/organization.schema';
import { CollectionSettings } from './collection-settings.schema';
import { dueReminderStep, reminderKey } from './domain/reminder-schedule';

const REMINDER_KINDS = Object.values(CommunicationKind).filter((k) => k !== 'INVOICE');

@Injectable()
export class CollectionsService implements OnModuleInit {
  private readonly logger = new Logger(CollectionsService.name);

  constructor(
    @InjectModel(CollectionSettings.name) private readonly settings: Model<CollectionSettings>,
    @InjectModel(Invoice.name) private readonly invoices: Model<Invoice>,
    @InjectModel(Customer.name) private readonly customers: Model<Customer>,
    @InjectModel(Organization.name) private readonly organizations: Model<Organization>,
    @InjectModel(Communication.name) private readonly communications: Model<Communication>,
    private readonly communicationsService: CommunicationsService,
    private readonly queue: JobQueue,
    private readonly audit: AuditLogsService,
  ) {}

  onModuleInit() {
    this.queue.register(ScheduledJob.RUN_REMINDERS, () => this.runAll());
  }

  async getSettings(organizationId: string) {
    return this.settings
      .findOneAndUpdate(
        { organizationId },
        { $setOnInsert: { organizationId } },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      )
      .exec();
  }

  async updateSettings(organizationId: string, input: CollectionSettingsInput) {
    const before = (await this.getSettings(organizationId)).toJSON();
    const updated = await this.settings
      .findOneAndUpdate({ organizationId }, input, { new: true })
      .exec();
    await this.audit.record({
      organizationId,
      action: 'collections.settings_updated',
      entityType: 'CollectionSettings',
      entityId: updated!._id,
      before,
      after: updated,
    });
    return updated!;
  }

  /** Scheduler job: every organization whose local send hour has passed. */
  async runAll(now = new Date()): Promise<void> {
    const cursor = this.organizations
      .find({ isSuspended: false })
      .select('timezone')
      .lean()
      .cursor();
    for await (const org of cursor) {
      try {
        await this.runForOrganization(org._id.toString(), { now, respectSendHour: true });
      } catch (err) {
        this.logger.error(`Reminder run failed for ${org._id.toString()}`, err as Error);
      }
    }
  }

  /** Schedules the reminder each open invoice is due today. Returns how many were queued. */
  async runForOrganization(
    organizationId: string,
    options: { now?: Date; respectSendHour?: boolean } = {},
  ): Promise<number> {
    const now = options.now ?? new Date();
    const [settings, organization] = await Promise.all([
      this.getSettings(organizationId),
      this.organizations.findById(organizationId).select('timezone').lean().exec(),
    ]);
    if (!settings.enabled || !organization) return 0;
    if (options.respectSendHour && localHour(organization.timezone, now) < settings.sendHour)
      return 0;

    const today = todayIn(organization.timezone, now);
    const quiet = await this.customers
      .find({
        organizationId,
        $or: [
          { remindersEnabled: false },
          { archivedAt: { $ne: null } },
          { email: { $in: [null, ''] } },
        ],
      })
      .distinct('_id')
      .exec();
    const cursor = this.invoices
      .find({
        organizationId,
        status: { $in: OPEN_STATUSES },
        remindersPaused: { $ne: true },
        customerId: { $nin: quiet },
        $expr: { $lt: ['$allocatedMinor', '$totalMinor'] },
      })
      .select('customerId dueDate')
      .lean()
      .cursor();

    let queued = 0;
    for await (const invoice of cursor) {
      const step = dueReminderStep(invoice, settings.rules, today);
      if (!step) continue;
      const scheduled = await this.communicationsService.schedule(organizationId, {
        customerId: invoice.customerId.toString(),
        invoiceIds: [invoice._id.toString()],
        kind: step.kind,
        reminderKey: reminderKey(invoice._id.toString(), step),
      });
      if (scheduled) queued++;
    }
    return queued;
  }

  /** A person-initiated reminder for one customer's invoices. */
  async createManual(organizationId: string, input: CreateReminderInput) {
    const invoices = await this.invoices
      .find({ _id: { $in: input.invoiceIds }, organizationId })
      .select('customerId status')
      .exec();
    if (invoices.length !== input.invoiceIds.length) throw notFound('Invoice');
    const customerIds = new Set(invoices.map((i) => i.customerId.toString()));
    if (customerIds.size > 1) {
      throw unprocessable('MIXED_CUSTOMERS', "A reminder can only cover one customer's invoices");
    }
    if (invoices.some((i) => !OPEN_STATUSES.includes(i.status as (typeof OPEN_STATUSES)[number]))) {
      throw unprocessable(
        'INVOICE_NOT_OPEN',
        'Reminders can only be sent for unpaid issued invoices',
      );
    }
    const scheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : undefined;
    if (scheduledAt && scheduledAt.getTime() < Date.now() - 60_000) {
      throw unprocessable('SCHEDULE_IN_PAST', 'Choose a time in the future');
    }
    return this.communicationsService.schedule(organizationId, {
      customerId: [...customerIds][0]!,
      invoiceIds: input.invoiceIds,
      kind: CommunicationKind.MANUAL,
      message: input.message,
      scheduledAt,
    });
  }

  listReminders(organizationId: string, query: ListRemindersQuery) {
    const filter: FilterQuery<Communication> = { organizationId, kind: { $in: REMINDER_KINDS } };
    if (query.status) filter.status = query.status;
    if (query.customerId) filter.customerId = query.customerId;
    return paginate(this.communications, filter, query, {
      sortable: ['scheduledAt', 'createdAt'],
      defaultSort: 'scheduledAt',
      populate: [
        { path: 'customerId', select: 'name email' },
        { path: 'invoiceIds', select: 'invoiceNumber dueDate totalMinor allocatedMinor' },
      ],
    });
  }

  async sendNow(organizationId: string, reminderId: string) {
    const reminder = await this.getScheduled(organizationId, reminderId);
    reminder.scheduledAt = new Date();
    await reminder.save();
    await this.queue.enqueue(DELIVER_JOB, { communicationId: reminderId }, { maxAttempts: 3 });
    return reminder;
  }

  async update(organizationId: string, reminderId: string, input: UpdateReminderInput) {
    const reminder = await this.getScheduled(organizationId, reminderId);
    if (input.status === 'CANCELLED') {
      reminder.status = NotificationStatus.CANCELLED;
    } else if (input.scheduledAt) {
      reminder.scheduledAt = new Date(input.scheduledAt);
      await this.queue.enqueue(
        DELIVER_JOB,
        { communicationId: reminderId },
        { runAt: reminder.scheduledAt, maxAttempts: 3 },
      );
    }
    await reminder.save();
    return reminder;
  }

  async setInvoicePaused(organizationId: string, invoiceId: string, paused: boolean) {
    const invoice = await this.invoices
      .findOneAndUpdate(
        { _id: invoiceId, organizationId },
        { remindersPaused: paused },
        { new: true },
      )
      .exec();
    if (!invoice) throw notFound('Invoice');
    await this.audit.record({
      organizationId,
      action: paused ? 'reminders.paused' : 'reminders.resumed',
      entityType: 'Invoice',
      entityId: invoice._id,
    });
    return { invoiceId, remindersPaused: invoice.remindersPaused };
  }

  private async getScheduled(organizationId: string, reminderId: string) {
    const reminder = await this.communications
      .findOne({ _id: reminderId, organizationId, kind: { $in: REMINDER_KINDS } })
      .exec();
    if (!reminder) throw notFound('Reminder');
    if (reminder.status !== NotificationStatus.SCHEDULED) {
      throw unprocessable('REMINDER_NOT_SCHEDULED', 'Only scheduled reminders can be changed');
    }
    return reminder;
  }
}

function localHour(timezone: string, now: Date): number {
  return Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      hourCycle: 'h23',
    }).format(now),
  );
}
