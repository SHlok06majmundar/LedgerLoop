import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { AppConfig } from '../config/app-config.service';
import { FileStorage, type StoredFile } from './file-storage';

const KEY_PATTERN = /^[\w-]+(\/[\w.-]+)*$/;

/** Stores files under UPLOAD_DIR with a sidecar holding the content type. */
@Injectable()
export class LocalFileStorage extends FileStorage {
  private readonly root: string;

  constructor(config: AppConfig) {
    super();
    this.root = resolve(config.get('UPLOAD_DIR'));
  }

  async put(key: string, data: Buffer, contentType: string): Promise<void> {
    const path = this.pathFor(key);
    await mkdir(dirname(path), { recursive: true });
    // Write then rename so readers never see a half-written file.
    const temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, data);
    await rename(temp, path);
    await writeFile(`${path}.meta`, contentType);
  }

  async get(key: string): Promise<StoredFile | null> {
    const path = this.pathFor(key);
    try {
      const [data, contentType] = await Promise.all([
        readFile(path),
        readFile(`${path}.meta`, 'utf8').catch(() => 'application/octet-stream'),
      ]);
      return { data, contentType };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async delete(key: string): Promise<void> {
    const path = this.pathFor(key);
    await Promise.all([rm(path, { force: true }), rm(`${path}.meta`, { force: true })]);
  }

  private pathFor(key: string): string {
    if (!KEY_PATTERN.test(key) || key.includes('..')) {
      throw new Error(`Invalid storage key: ${key}`);
    }
    const path = resolve(join(this.root, key));
    if (!path.startsWith(this.root + sep)) throw new Error(`Invalid storage key: ${key}`);
    return path;
  }
}
