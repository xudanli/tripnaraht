/**
 * NARA Look field media — local/OSS-backed refs for observation create/append.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'crypto';
import { existsSync } from 'fs';
import { mkdir, writeFile, unlink } from 'fs/promises';
import { join } from 'path';

export interface LookMediaRecord {
  mediaId: string;
  mediaRef: string;
  tripId: string;
  mimeType: string;
  bytes: number;
  fileName: string;
  storageKey: string;
  url: string | null;
  createdAt: string;
  category: 'FIELD_OBSERVATION';
}

@Injectable()
export class LookMediaStore {
  private readonly logger = new Logger(LookMediaStore.name);
  private readonly byId = new Map<string, LookMediaRecord>();
  private readonly uploadDir: string;

  constructor(@Optional() private readonly config?: ConfigService) {
    this.uploadDir =
      this.config?.get<string>('LOOK_MEDIA_UPLOAD_DIR') ??
      join(process.cwd(), 'uploads', 'look-field');
  }

  async save(input: {
    tripId: string;
    buffer: Buffer;
    originalName: string;
    mimeType: string;
  }): Promise<LookMediaRecord> {
    await mkdir(this.uploadDir, { recursive: true });
    const ext = input.originalName.includes('.')
      ? `.${input.originalName.split('.').pop()}`
      : '';
    const mediaId = `lm_${randomUUID().replace(/-/g, '').slice(0, 20)}`;
    const fileName = `${mediaId}${ext}`;
    const storageKey = join(this.uploadDir, fileName);
    await writeFile(storageKey, input.buffer);

    const baseUrl = this.config?.get<string>('FILE_STORAGE_BASE_URL');
    const url = baseUrl
      ? `${baseUrl.replace(/\/$/, '')}/look-field/${fileName}`
      : null;

    const record: LookMediaRecord = {
      mediaId,
      mediaRef: mediaId,
      tripId: input.tripId,
      mimeType: input.mimeType,
      bytes: input.buffer.length,
      fileName: input.originalName,
      storageKey,
      url,
      createdAt: new Date().toISOString(),
      category: 'FIELD_OBSERVATION',
    };
    this.byId.set(mediaId, record);
    this.logger.debug(
      `Look media saved trip=${input.tripId} id=${mediaId} bytes=${record.bytes}`,
    );
    return { ...record };
  }

  get(mediaId: string): LookMediaRecord | undefined {
    const r = this.byId.get(mediaId);
    return r ? { ...r } : undefined;
  }

  /** Content hash helper for evidence packages */
  hashBuffer(buffer: Buffer): string {
    return `mh_${createHash('sha256').update(buffer).digest('hex').slice(0, 16)}`;
  }

  async delete(mediaId: string): Promise<boolean> {
    const r = this.byId.get(mediaId);
    if (!r) return false;
    this.byId.delete(mediaId);
    if (existsSync(r.storageKey)) {
      await unlink(r.storageKey).catch(() => undefined);
    }
    return true;
  }
}
