import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { calculateInvoiceTotals, InvoiceStatus } from '@ledgerloop/shared-types';
import type {
  CreateInvoiceInput,
  InvoiceItemInput,
  ListInvoicesQuery,
  UpdateInvoiceInput,
} from '@ledgerloop/validation';
import type { ClientSession, FilterQuery, Model } from 'mongoose';
import { notFound, unprocessable } from '../../common/errors/app-exception';
import { paginate } from '../../database/paginate';
import { SequenceService } from '../../database/sequence.service';
import { TransactionRunner } from '../../database/transaction-runner';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CustomersService } from '../customers/customers.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { addDays, deriveStatus, todayIn } from './domain/invoice-status';
import { Invoice, type InvoiceDocument } from './invoice.schema';

export const OPEN_STATUSES = [
  InvoiceStatus.ISSUED,
  InvoiceStatus.PARTIALLY_PAID,
  InvoiceStatus.OVERDUE,
];

@Injectable()
export class InvoicesService {
  constructor(
    @InjectModel(Invoice.name) private readonly invoices: Model<Invoice>,
    private readonly customers: CustomersService,
    private readonly organizations: OrganizationsService,
    private readonly sequences: SequenceService,
    private readonly tx: TransactionRunner,
    private readonly audit: AuditLogsService,
  ) {}

  async create(organizationId: string, input: CreateInvoiceInput): Promise<InvoiceDocument> {
    const organization = await this.organizations.get(organizationId);
    return this.tx.run(async (session) => {
      const customer = await this.billableCustomer(organizationId, input.customerId, session);
      const year = input.issueDate.slice(0, 4);
      const seq = await this.sequences.next(`invoice:${organizationId}:${year}`, session);
      const [invoice] = await this.invoices.create(
        [
          {
            organizationId,
            customerId: customer._id,
            invoiceNumber: `INV-${year}-${String(seq).padStart(4, '0')}`,
            issueDate: input.issueDate,
            dueDate: input.dueDate ?? addDays(input.issueDate, customer.paymentTermsDays),
            currency: organization.currency,
            notes: input.notes,
            terms: input.terms,
            ...priceItems(input.items),
          },
        ],
        { session },
      );
      await this.audit.record(
        {
          organizationId,
          action: 'invoice.created',
          entityType: 'Invoice',
          entityId: invoice!._id,
          after: invoice,
        },
        session,
      );
      return invoice!;
    });
  }

  async list(organizationId: string, query: ListInvoicesQuery) {
    const filter: FilterQuery<Invoice> = { organizationId };
    if (query.status === 'OPEN') filter.status = { $in: OPEN_STATUSES };
    else if (query.status) filter.status = query.status;
    if (query.customerId) filter.customerId = query.customerId;
    if (query.from || query.to) {
      filter.issueDate = {
        ...(query.from && { $gte: query.from }),
        ...(query.to && { $lte: query.to }),
      };
    }
    return paginate(this.invoices, filter, query, {
      searchFields: ['invoiceNumber', 'customerSnapshot.name'],
      sortable: ['issueDate', 'dueDate', 'totalMinor', 'invoiceNumber', 'createdAt'],
      defaultSort: 'issueDate',
      populate: { path: 'customerId', select: 'name email' },
    });
  }

  async get(
    organizationId: string,
    invoiceId: string,
    session?: ClientSession,
  ): Promise<InvoiceDocument> {
    const invoice = await this.invoices
      .findOne({ _id: invoiceId, organizationId })
      .session(session ?? null)
      .exec();
    if (!invoice) throw notFound('Invoice');
    return invoice;
  }

  async getDetailed(organizationId: string, invoiceId: string) {
    const invoice = await this.get(organizationId, invoiceId);
    await invoice.populate({ path: 'customerId', select: 'name email phone gstin billingAddress' });
    return invoice;
  }

  async update(organizationId: string, invoiceId: string, input: UpdateInvoiceInput) {
    return this.tx.run(async (session) => {
      const invoice = await this.get(organizationId, invoiceId, session);
      if (invoice.status !== InvoiceStatus.DRAFT) {
        throw unprocessable('INVOICE_NOT_EDITABLE', 'Only draft invoices can be edited');
      }
      const before = invoice.toJSON();
      if (input.customerId) {
        const customer = await this.billableCustomer(organizationId, input.customerId, session);
        invoice.customerId = customer._id;
      }
      const { items, customerId: _customerId, ...rest } = input;
      invoice.set(rest);
      if (items) invoice.set(priceItems(items));
      if (invoice.dueDate < invoice.issueDate) {
        throw unprocessable('INVALID_DUE_DATE', 'Due date cannot be before the issue date');
      }
      await invoice.save({ session });
      await this.audit.record(
        {
          organizationId,
          action: 'invoice.updated',
          entityType: 'Invoice',
          entityId: invoice._id,
          before,
          after: invoice,
        },
        session,
      );
      return invoice;
    });
  }

  async issue(organizationId: string, invoiceId: string) {
    const organization = await this.organizations.get(organizationId);
    return this.tx.run(async (session) => {
      const invoice = await this.get(organizationId, invoiceId, session);
      if (invoice.status !== InvoiceStatus.DRAFT) {
        throw unprocessable('INVOICE_NOT_DRAFT', 'Only draft invoices can be issued');
      }
      const customer = await this.billableCustomer(
        organizationId,
        invoice.customerId.toString(),
        session,
      );
      invoice.customerSnapshot = {
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        gstin: customer.gstin,
        billingAddress: customer.billingAddress,
      };
      invoice.issuedAt = new Date();
      invoice.status = deriveStatus(
        { ...invoice.toObject(), status: InvoiceStatus.ISSUED },
        todayIn(organization.timezone),
      );
      await invoice.save({ session });
      await this.audit.record(
        {
          organizationId,
          action: 'invoice.issued',
          entityType: 'Invoice',
          entityId: invoice._id,
          after: { status: invoice.status, issuedAt: invoice.issuedAt },
        },
        session,
      );
      return invoice;
    });
  }

  /**
   * Deletes a draft. Issued invoices are legal records, so they are voided
   * instead; the audit log keeps the deleted draft's number.
   */
  async remove(organizationId: string, invoiceId: string) {
    await this.tx.run(async (session) => {
      const invoice = await this.get(organizationId, invoiceId, session);
      if (invoice.status !== InvoiceStatus.DRAFT) {
        throw unprocessable(
          'INVOICE_NOT_DELETABLE',
          'Only drafts can be deleted; void an issued invoice instead',
        );
      }
      await invoice.deleteOne({ session });
      await this.audit.record(
        {
          organizationId,
          action: 'invoice.deleted',
          entityType: 'Invoice',
          entityId: invoice._id,
          before: invoice,
        },
        session,
      );
    });
  }

  /** Voiding is only allowed while nothing is allocated; reverse allocations first. */
  async void(organizationId: string, invoiceId: string, reason: string) {
    return this.tx.run(async (session) => {
      const invoice = await this.get(organizationId, invoiceId, session);
      if (invoice.status === InvoiceStatus.VOID) {
        throw unprocessable('INVOICE_NOT_VOIDABLE', 'This invoice is already void');
      }
      if (invoice.allocatedMinor > 0) {
        throw unprocessable(
          'INVOICE_HAS_ALLOCATIONS',
          'Reverse the payment allocations on this invoice before voiding it',
        );
      }
      const before = { status: invoice.status };
      invoice.status = InvoiceStatus.VOID;
      invoice.voidedAt = new Date();
      invoice.voidReason = reason;
      await invoice.save({ session });
      await this.audit.record(
        {
          organizationId,
          action: 'invoice.voided',
          entityType: 'Invoice',
          entityId: invoice._id,
          before,
          after: { status: invoice.status, voidReason: reason },
        },
        session,
      );
      return invoice;
    });
  }

  async markSent(organizationId: string, invoiceId: string): Promise<void> {
    await this.invoices.updateOne({ _id: invoiceId, organizationId }, { sentAt: new Date() });
  }

  /** Re-derives the status of every open invoice (run daily so OVERDUE appears on time). */
  async refreshStatuses(organizationId: string, timezone: string): Promise<number> {
    const today = todayIn(timezone);
    const result = await this.invoices.updateMany(
      {
        organizationId,
        status: { $in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID] },
        dueDate: { $lt: today },
        $expr: { $lt: ['$allocatedMinor', '$totalMinor'] },
      },
      { status: InvoiceStatus.OVERDUE },
    );
    return result.modifiedCount;
  }

  private async billableCustomer(
    organizationId: string,
    customerId: string,
    session: ClientSession,
  ) {
    const customer = await this.customers.get(organizationId, customerId, session);
    if (customer.archivedAt) {
      throw unprocessable('CUSTOMER_ARCHIVED', 'Restore this customer before invoicing them');
    }
    return customer;
  }
}

function priceItems(items: InvoiceItemInput[]) {
  let totals;
  try {
    totals = calculateInvoiceTotals(items);
  } catch (err) {
    throw unprocessable('INVALID_LINE_ITEM', (err as Error).message);
  }
  return {
    items: items.map((item, i) => ({ ...item, ...totals.lines[i]! })),
    subtotalMinor: totals.subtotalMinor,
    discountMinor: totals.discountMinor,
    taxMinor: totals.taxMinor,
    totalMinor: totals.totalMinor,
  };
}
