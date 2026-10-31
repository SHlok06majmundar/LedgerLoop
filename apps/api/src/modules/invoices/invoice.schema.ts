import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { InvoiceStatus } from '@ledgerloop/shared-types';
import { SchemaTypes, Types, type HydratedDocument } from 'mongoose';

@Schema({ _id: false })
export class InvoiceItem {
  @Prop({ required: true }) description!: string;
  @Prop({ required: true }) quantityMilli!: number;
  @Prop({ required: true }) unitPriceMinor!: number;
  @Prop({ required: true, default: 0 }) taxRateBps!: number;
  @Prop({ required: true, default: 0 }) discountMinor!: number;
  @Prop({ required: true }) amountMinor!: number;
  @Prop({ required: true }) taxMinor!: number;
  @Prop({ required: true }) totalMinor!: number;
}
const InvoiceItemSchema = SchemaFactory.createForClass(InvoiceItem);

/** Customer details frozen when the invoice is issued. */
@Schema({ _id: false })
export class CustomerSnapshot {
  @Prop({ required: true }) name!: string;
  @Prop() email?: string;
  @Prop() phone?: string;
  @Prop() gstin?: string;
  @Prop({ type: SchemaTypes.Mixed }) billingAddress?: unknown;
}
const CustomerSnapshotSchema = SchemaFactory.createForClass(CustomerSnapshot);

@Schema({ timestamps: true, collection: 'invoices' })
export class Invoice {
  @Prop({ type: SchemaTypes.ObjectId, required: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, required: true, ref: 'Customer' })
  customerId!: Types.ObjectId;

  @Prop({ required: true })
  invoiceNumber!: string;

  @Prop({ required: true, enum: Object.values(InvoiceStatus), default: InvoiceStatus.DRAFT })
  status!: InvoiceStatus;

  /** Calendar dates, YYYY-MM-DD. */
  @Prop({ required: true }) issueDate!: string;
  @Prop({ required: true }) dueDate!: string;

  @Prop({ required: true }) currency!: string;

  @Prop({ type: [InvoiceItemSchema], required: true })
  items!: InvoiceItem[];

  @Prop({ required: true }) subtotalMinor!: number;
  @Prop({ required: true }) discountMinor!: number;
  @Prop({ required: true }) taxMinor!: number;
  @Prop({ required: true }) totalMinor!: number;

  /** Cache of active allocations; see docs/adr/0004. */
  @Prop({ required: true, default: 0 })
  allocatedMinor!: number;

  @Prop() notes?: string;
  @Prop() terms?: string;

  @Prop({ type: CustomerSnapshotSchema })
  customerSnapshot?: CustomerSnapshot;

  @Prop({ type: Date, default: null }) issuedAt!: Date | null;
  @Prop({ type: Date, default: null }) voidedAt!: Date | null;
  @Prop() voidReason?: string;
  @Prop({ type: Date, default: null }) sentAt!: Date | null;
  @Prop({ type: Date, default: null }) paidAt!: Date | null;
  @Prop() pdfKey?: string;

  /** Stops automated reminders for this invoice only. */
  @Prop({ default: false }) remindersPaused!: boolean;

  createdAt!: Date;
  updatedAt!: Date;
}

export type InvoiceDocument = HydratedDocument<Invoice>;
export const InvoiceSchema = SchemaFactory.createForClass(Invoice);
InvoiceSchema.virtual('outstandingMinor').get(function (this: Invoice) {
  return this.status === InvoiceStatus.VOID ? 0 : this.totalMinor - this.allocatedMinor;
});
InvoiceSchema.index({ organizationId: 1, invoiceNumber: 1 }, { unique: true });
InvoiceSchema.index({ organizationId: 1, status: 1, dueDate: 1 });
InvoiceSchema.index({ organizationId: 1, customerId: 1, issueDate: -1 });
InvoiceSchema.index({ organizationId: 1, issueDate: -1 });
