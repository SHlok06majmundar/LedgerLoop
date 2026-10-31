export interface StoredFile {
  data: Buffer;
  contentType: string;
}

/**
 * Private file storage addressed by key (e.g. `orgs/<id>/invoices/<id>.pdf`).
 * Files are never served directly; authorized routes read them. See docs/adr/0007.
 */
export abstract class FileStorage {
  abstract put(key: string, data: Buffer, contentType: string): Promise<void>;
  /** Returns null when the key does not exist. */
  abstract get(key: string): Promise<StoredFile | null>;
  abstract delete(key: string): Promise<void>;
}

export const storageKeys = {
  invoicePdf: (organizationId: string, invoiceId: string) =>
    `orgs/${organizationId}/invoices/${invoiceId}.pdf`,
  statement: (organizationId: string, importId: string) =>
    `orgs/${organizationId}/statements/${importId}.csv`,
  importErrors: (organizationId: string, importId: string) =>
    `orgs/${organizationId}/statements/${importId}-errors.csv`,
  logo: (organizationId: string, extension: string) =>
    `orgs/${organizationId}/branding/logo.${extension}`,
};
