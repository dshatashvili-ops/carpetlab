import { Injectable } from '@nestjs/common';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export abstract class ObjectStorage {
  abstract put(key: string, buf: Buffer, mime: string): Promise<void>;
  abstract delete(key: string): Promise<void>;
}

/** Dev implementation on local disk. Production swaps in an S3-compatible adapter behind the same interface. */
@Injectable()
export class LocalDiskStorage extends ObjectStorage {
  private readonly root = process.env.STORAGE_DIR ?? join(process.cwd(), 'storage');

  async put(key: string, buf: Buffer): Promise<void> {
    const path = join(this.root, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, buf);
  }

  async delete(key: string): Promise<void> {
    await rm(join(this.root, key), { force: true });
  }
}
