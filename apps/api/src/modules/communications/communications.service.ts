import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InvoiceStatus, NotificationStatus } from '@ledgerloop/shared-types';
import { z } from 'zod';
import { mongo, Types, type ClientSession, type FilterQuery, type Model } from 'mongoose';
import { RequestContext } from '../../common/context/request-context';
import { notFound, unprocessable } from '../../common/errors/app-exception';
import { paginate, type PageRequest } from '../../database/paginate';
import { JobQueue } from '../../jobs/job-queue.service';
import { Mailer, type MailAttachment } from '../../mail/mailer';
import { customerInvoiceTemplate } from '../../mail/templates';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CustomersService } from '../customers/customers.service';
import { InvoiceDocumentsService } from '../invoices/invoice-documents.service';
import { formatMoney } from '../invoices/pdf/invoice-pdf.renderer';
import { Invoice } from '../invoices/invoice.schema';
import { OrganizationsService } from '../organizations/organizations.service';
import {
  Communication,
  CommunicationKind,
  type CommunicationDocument,
} from './communication.schema';

export const DELIVER_JOB = 'communications.deliver';
const MAX_ATTACHMENTS = 5;

export interface ScheduleInput {
  customerId: string;
  invoiceIds: string[];
  kind: CommunicationKind;
  to?: string;
  message?: string;
  scheduledAt?: Date;
  reminderKey?: string;
}

export const listCommunicationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  order: z.enum(['asc', 'desc']).default('desc'),
  customerId: z
    .string()
    .regex(/^[a-f\d]{24}$/i)
    .optional(),
  invoiceId: z
    .string()
    .regex(/^[a-f\d]{24}$/i)
    .optional(),
  status: z.enum(['SCHEDULED', 'SENT', 'FAILED', 'CANCELLED']).optional(),
  kind: z.string().max(20).optional(),
});
export type ListCommunicationsQuery = z.infer<typeof listCommunicationsQuerySchema>;

/** Customer email: scheduled as a record, delivered by a background job. */
@Injectable()
export class CommunicationsService implements OnModuleInit {
  constructor(
    @InjectModel(Communication.name) private readonly communications: Model<Communication>,
    @InjectModel(Invoice.name) private readonly invoices: Model<Invoice>,
    private readonly customers: CustomersService,
    private readonly organizations: OrganizationsService,
    private readonly documents: InvoiceDocumentsService,
    private readonly mailer: Mailer,
    private readonly queue: JobQueue,
    private readonly audit: AuditLogsService,
  ) {}

  onModuleInit() {
    this.queue.register(DELIVER_JOB, (payload) => this.deliver(payload.communicationId as string));
  }

  /** Returns null when an automated reminder with the same key already exists. */
  async schedule(
    organizationId: string,
    input: ScheduleInput,
    session?: ClientSession,
  ): Promise<CommunicationDocument | null> {
    const customer = await this.customers.get(organizationId, input.customerId, session);
    const to = input.to ?? customer.email;
    if (!to) {
      throw unprocessable(
        'CUSTOMER_EMAIL_MISSING',
        `Add an email address for ${customer.name} before sending`,
      );
    }
    const invoices = await this.invoices
      .find({ _id: { $in: input.invoiceIds }, organizationId, customerId: customer._id })
      .session(session ?? null)
      .select('invoiceNumber')
      .exec();
    if (invoices.length !== input.invoiceIds.length) throw notFound('Invoice');

    const organization = await this.organizations.get(organizationId);
    const subject = customerInvoiceTemplate({
      kind: input.kind,
      organizationName: organization.name,
      customerName: customer.name,
      invoices: invoices.map((i) => ({
        invoiceNumber: i.invoiceNumber,
        dueDate: '',
        amountDue: '',
      })),
    }).subject;

    let communication: CommunicationDocument;
    try {
      [communication] = (await this.communications.create(
        [
          {
            organizationId,
            customerId: customer._id,
            invoiceIds: invoices.map((i) => i._id),
            kind: input.kind,
            to,
            subject,
            message: input.message,
            scheduledAt: input.scheduledAt ?? new Date(),
            reminderKey: input.reminderKey,
            createdBy: actor(),
          },
        ],
        { session },
      )) as [CommunicationDocument];
    } catch (err) {
      if (input.reminderKey && err instanceof mongo.MongoServerError && err.code === 11000) {
        return null;
      }
      throw err;
    }
    await this.queue.enqueue(
      DELIVER_JOB,
      { communicationId: communication.id as string },
      { runAt: communication.scheduledAt, maxAttempts: 3, session },
    );
    return communication;
  }

  /** Sends the email; throws on failure so the queue retries with backoff. */
  async deliver(communicationId: string): Promise<void> {
    const communication = await this.communications.findById(communicationId).exec();
    if (
      !communication ||
      communication.status === NotificationStatus.SENT ||
      communication.status === NotificationStatus.CANCELLED
    ) {
      return;
    }
    const organizationId = communication.organizationId.toString();
    try {
      const [organization, customer, invoices] = await Promise.all([
        this.organizations.get(organizationId),
        this.customers.get(organizationId, communication.customerId.toString()),
        this.invoices
          .find({ _id: { $in: communication.invoiceIds }, organizationId })
          .sort({ dueDate: 1 })
          .exec(),
      ]);
      const payable = invoices.filter((i) => i.status !== InvoiceStatus.VOID);
      if (
        communication.kind !== CommunicationKind.INVOICE &&
        communication.kind !== CommunicationKind.MANUAL
      ) {
        // Reminders for invoices paid in the meantime are dropped, not sent.
        const stillOwed = payable.filter((i) => i.allocatedMinor < i.totalMinor);
        if (stillOwed.length === 0) {
          communication.status = NotificationStatus.CANCELLED;
          communication.lastError = 'Invoices were paid before the reminder was sent';
          await communication.save();
          return;
        }
      }

      const template = customerInvoiceTemplate({
        kind: communication.kind,
        organizationName: organization.name,
        customerName: customer.name,
        message: communication.message,
        invoices: payable.map((i) => ({
          invoiceNumber: i.invoiceNumber,
          dueDate: i.dueDate,
          amountDue: formatMoney(i.totalMinor - i.allocatedMinor, i.currency),
        })),
      });
      const attachments: MailAttachment[] = [];
      for (const invoice of payable.slice(0, MAX_ATTACHMENTS)) {
        const pdf = await this.documents.pdf(organizationId, invoice.id as string);
        attachments.push({
          filename: pdf.fileName,
          content: pdf.data,
          contentType: 'application/pdf',
        });
      }

      communication.attempts += 1;
      await this.mailer.send({ to: communication.to, ...template, attachments });
      communication.status = NotificationStatus.SENT;
      communication.sentAt = new Date();
      communication.lastError = undefined;
      await communication.save();

      if (communication.kind === CommunicationKind.INVOICE) {
        await this.invoices.updateMany(
          { _id: { $in: communication.invoiceIds } },
          { sentAt: communication.sentAt },
        );
      }
    } catch (err) {
      communication.status = NotificationStatus.FAILED;
      communication.lastError = (err as Error).message.slice(0, 1000);
      await communication.save();
      throw err;
    }
  }

  async retry(organizationId: string, communicationId: string) {
    const communication = await this.get(organizationId, communicationId);
    if (communication.status !== NotificationStatus.FAILED) {
      throw unprocessable('NOT_RETRYABLE', 'Only failed emails can be retried');
    }
    communication.status = NotificationStatus.SCHEDULED;
    await communication.save();
    await this.queue.enqueue(DELIVER_JOB, { communicationId }, { maxAttempts: 3 });
    await this.audit.record({
      organizationId,
      action: 'communication.retried',
      entityType: 'Communication',
      entityId: communication._id,
    });
    return communication;
  }

  async cancel(organizationId: string, communicationId: string) {
    const communication = await this.get(organizationId, communicationId);
    if (communication.status === NotificationStatus.SENT) {
      throw unprocessable('ALREADY_SENT', 'This email was already sent');
    }
    communication.status = NotificationStatus.CANCELLED;
    await communication.save();
    return communication;
  }

  list(organizationId: string, query: ListCommunicationsQuery) {
    const filter: FilterQuery<Communication> = { organizationId };
    if (query.customerId) filter.customerId = query.customerId;
    if (query.invoiceId) filter.invoiceIds = query.invoiceId;
    if (query.status) filter.status = query.status;
    if (query.kind) filter.kind = query.kind;
    const page: PageRequest = { ...query };
    return paginate(this.communications, filter, page, {
      defaultSort: 'createdAt',
      populate: [
        { path: 'customerId', select: 'name email' },
        { path: 'invoiceIds', select: 'invoiceNumber' },
      ],
    });
  }

  private async get(organizationId: string, communicationId: string) {
    const communication = await this.communications
      .findOne({ _id: communicationId, organizationId })
      .exec();
    if (!communication) throw notFound('Communication');
    return communication;
  }
}

function actor(): Types.ObjectId | undefined {
  const userId = RequestContext.get()?.userId;
  return userId ? new Types.ObjectId(userId) : undefined;
}
