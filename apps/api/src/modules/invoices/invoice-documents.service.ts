import { Injectable } from '@nestjs/common';
import { FileStorage, storageKeys } from '../../storage/file-storage';
import { OrganizationsService } from '../organizations/organizations.service';
import { CustomersService } from '../customers/customers.service';
import { InvoicesService } from './invoices.service';
import { renderInvoicePdf, type PdfParty } from './pdf/invoice-pdf.renderer';

export interface InvoicePdf {
  fileName: string;
  data: Buffer;
}

/** Produces the invoice PDF and keeps the latest copy in file storage. */
@Injectable()
export class InvoiceDocumentsService {
  constructor(
    private readonly invoices: InvoicesService,
    private readonly customers: CustomersService,
    private readonly organizations: OrganizationsService,
    private readonly storage: FileStorage,
  ) {}

  async pdf(organizationId: string, invoiceId: string): Promise<InvoicePdf> {
    const invoice = await this.invoices.get(organizationId, invoiceId);
    const organization = await this.organizations.get(organizationId);
    const buyer: PdfParty =
      invoice.customerSnapshot ??
      (await this.customers.get(organizationId, invoice.customerId.toString()));
    const logo = organization.logoKey ? await this.storage.get(organization.logoKey) : null;

    const data = await renderInvoicePdf(
      invoice.toObject(),
      {
        name: organization.name,
        email: organization.email,
        phone: organization.phone,
        gstin: organization.gstin,
        address: organization.address ? [organization.address] : [],
      },
      { ...buyer, address: formatAddress(buyer as { billingAddress?: unknown }) },
      logo?.data,
    );
    await this.storage.put(
      storageKeys.invoicePdf(organizationId, invoiceId),
      data,
      'application/pdf',
    );
    return { fileName: `${invoice.invoiceNumber}.pdf`, data };
  }
}

function formatAddress(party: { billingAddress?: unknown }): string[] {
  const a = party.billingAddress as Record<string, string> | undefined;
  if (!a) return [];
  return [
    [a.line1, a.line2].filter(Boolean).join(', '),
    [a.city, a.state, a.postalCode].filter(Boolean).join(', '),
  ].filter(Boolean);
}
