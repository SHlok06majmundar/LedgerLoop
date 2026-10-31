import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type {
  CreateCustomerInput,
  ListCustomersQuery,
  UpdateCustomerInput,
} from '@ledgerloop/validation';
import type { ClientSession, FilterQuery, Model } from 'mongoose';
import { notFound } from '../../common/errors/app-exception';
import { paginate } from '../../database/paginate';
import { TransactionRunner } from '../../database/transaction-runner';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { Customer, type CustomerDocument } from './customer.schema';

@Injectable()
export class CustomersService {
  constructor(
    @InjectModel(Customer.name) private readonly customers: Model<Customer>,
    private readonly tx: TransactionRunner,
    private readonly audit: AuditLogsService,
  ) {}

  async create(organizationId: string, input: CreateCustomerInput): Promise<CustomerDocument> {
    return this.tx.run(async (session) => {
      const [customer] = await this.customers.create([{ ...input, organizationId }], { session });
      await this.audit.record(
        {
          organizationId,
          action: 'customer.created',
          entityType: 'Customer',
          entityId: customer!._id,
          after: customer,
        },
        session,
      );
      return customer!;
    });
  }

  list(organizationId: string, query: ListCustomersQuery) {
    const filter: FilterQuery<Customer> = { organizationId };
    if (query.status === 'active') filter.archivedAt = null;
    if (query.status === 'archived') filter.archivedAt = { $ne: null };
    return paginate(this.customers, filter, query, {
      searchFields: ['name', 'email', 'phone', 'gstin'],
      sortable: ['name', 'createdAt', 'paymentTermsDays'],
      defaultSort: 'name',
    });
  }

  /** Loads a customer only within the given organization. */
  async get(
    organizationId: string,
    customerId: string,
    session?: ClientSession,
  ): Promise<CustomerDocument> {
    const customer = await this.customers
      .findOne({ _id: customerId, organizationId })
      .session(session ?? null)
      .exec();
    if (!customer) throw notFound('Customer');
    return customer;
  }

  async update(organizationId: string, customerId: string, input: UpdateCustomerInput) {
    return this.tx.run(async (session) => {
      const customer = await this.get(organizationId, customerId, session);
      const before = customer.toJSON();
      customer.set(input);
      await customer.save({ session });
      await this.audit.record(
        {
          organizationId,
          action: 'customer.updated',
          entityType: 'Customer',
          entityId: customer._id,
          before,
          after: customer,
        },
        session,
      );
      return customer;
    });
  }

  async archive(organizationId: string, customerId: string) {
    return this.tx.run(async (session) => {
      const customer = await this.get(organizationId, customerId, session);
      if (customer.archivedAt) return customer;
      customer.archivedAt = new Date();
      await customer.save({ session });
      await this.audit.record(
        {
          organizationId,
          action: 'customer.archived',
          entityType: 'Customer',
          entityId: customer._id,
        },
        session,
      );
      return customer;
    });
  }

  async restore(organizationId: string, customerId: string) {
    const customer = await this.get(organizationId, customerId);
    customer.archivedAt = null;
    await customer.save();
    await this.audit.record({
      organizationId,
      action: 'customer.restored',
      entityType: 'Customer',
      entityId: customer._id,
    });
    return customer;
  }
}
