import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AppConfig } from '../config/app-config.service';
import { LocalFileStorage } from './local-file-storage';

describe('LocalFileStorage', () => {
  let dir: string;
  let storage: LocalFileStorage;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'll-storage-'));
    storage = new LocalFileStorage({ get: () => dir } as unknown as AppConfig);
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('round-trips a file with its content type', async () => {
    await storage.put('orgs/a1/invoices/i1.pdf', Buffer.from('%PDF-1.7'), 'application/pdf');

    const file = await storage.get('orgs/a1/invoices/i1.pdf');

    expect(file).toEqual({ data: Buffer.from('%PDF-1.7'), contentType: 'application/pdf' });
  });

  it('returns null for a missing file', async () => {
    expect(await storage.get('orgs/a1/missing.csv')).toBeNull();
  });

  it('refuses keys that escape the upload folder', async () => {
    await expect(storage.put('../outside.txt', Buffer.from('x'), 'text/plain')).rejects.toThrow(
      /invalid storage key/i,
    );
    await expect(storage.get('orgs/../../etc/passwd')).rejects.toThrow(/invalid storage key/i);
  });

  it('deletes a file', async () => {
    await storage.put('orgs/a1/logo.png', Buffer.from('png'), 'image/png');

    await storage.delete('orgs/a1/logo.png');

    expect(await storage.get('orgs/a1/logo.png')).toBeNull();
  });
});
