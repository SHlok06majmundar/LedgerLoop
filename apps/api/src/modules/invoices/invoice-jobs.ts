import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { JobQueue } from '../../jobs/job-queue.service';
import { Organization } from '../organizations/schemas/organization.schema';
import { ScheduledJob } from '../../scheduler/scheduled-tasks';
import { InvoicesService } from './invoices.service';

/** Marks invoices overdue as days pass, per organization timezone. */
@Injectable()
export class InvoiceJobs implements OnModuleInit {
  constructor(
    private readonly queue: JobQueue,
    private readonly invoices: InvoicesService,
    @InjectModel(Organization.name) private readonly organizations: Model<Organization>,
  ) {}

  onModuleInit() {
    this.queue.register(ScheduledJob.REFRESH_INVOICE_STATUSES, () => this.refreshAll());
  }

  async refreshAll(): Promise<void> {
    const cursor = this.organizations
      .find({ isSuspended: false })
      .select('timezone')
      .lean()
      .cursor();
    for await (const org of cursor) {
      await this.invoices.refreshStatuses(org._id.toString(), org.timezone);
    }
  }
}
