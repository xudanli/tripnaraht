import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { COMMS_AUDIO_SIGNED_URL_TTL_SEC } from '../utils/in-trip-comms-config.util';

export interface StoredCommsAudio {
  storageKey: string;
  fileUrl: string | null;
  mimeType: string;
  fileSizeBytes: number;
}

export interface SignedCommsAudioUrl {
  url: string;
  expiresAt: string;
  ttlSec: number;
}

@Injectable()
export class InTripCommsAudioStorageService {
  private readonly logger = new Logger(InTripCommsAudioStorageService.name);
  private readonly uploadDir: string;
  private readonly ossFolder = 'in-trip-comms';
  private ossClient: unknown = null;

  constructor(@Optional() private readonly configService?: ConfigService) {
    this.uploadDir =
      this.configService?.get<string>('COMMS_AUDIO_UPLOAD_DIR') ??
      join(process.cwd(), 'uploads', 'in-trip-comms');
    this.initOssClient();
  }

  async save(
    tripId: string,
    buffer: Buffer,
    options: { mimeType: string; fileName: string },
  ): Promise<StoredCommsAudio> {
    if (this.ossClient) {
      return this.saveToOss(tripId, buffer, options);
    }
    return this.saveToLocal(tripId, buffer, options);
  }

  async signDownloadUrl(storageKey: string, fileUrl: string | null): Promise<SignedCommsAudioUrl> {
    const ttlSec = COMMS_AUDIO_SIGNED_URL_TTL_SEC;
    const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString();

    if (this.ossClient && this.isOssKey(storageKey)) {
      const url = (
        this.ossClient as { signatureUrl: (k: string, o: { expires: number }) => string }
      ).signatureUrl(storageKey, { expires: ttlSec });
      return { url, expiresAt, ttlSec };
    }

    return {
      url: this.resolvePublicUrl(storageKey, fileUrl),
      expiresAt,
      ttlSec,
    };
  }

  private initOssClient(): void {
    const region = this.configService?.get<string>('ALIYUN_OSS_REGION');
    const accessKeyId = this.configService?.get<string>('ALIYUN_OSS_ACCESS_KEY_ID');
    const accessKeySecret = this.configService?.get<string>('ALIYUN_OSS_ACCESS_KEY_SECRET');
    const bucket = this.configService?.get<string>('ALIYUN_OSS_BUCKET');

    if (region && accessKeyId && accessKeySecret && bucket) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const OSS = require('ali-oss');
      this.ossClient = new OSS({ region, accessKeyId, accessKeySecret, bucket });
      this.logger.log(`Comms audio OSS ready (bucket: ${bucket})`);
    } else {
      this.logger.warn('OSS not configured — comms audio will use local storage');
    }
  }

  private async saveToOss(
    tripId: string,
    buffer: Buffer,
    options: { mimeType: string; fileName: string },
  ): Promise<StoredCommsAudio> {
    const key = `${this.ossFolder}/${tripId}/${options.fileName}`;
    const client = this.ossClient as {
      put: (k: string, b: Buffer, o: { headers: Record<string, string> }) => Promise<{ url: string }>;
    };
    const result = await client.put(key, buffer, {
      headers: {
        'Content-Type': options.mimeType,
        'Cache-Control': 'private, max-age=3600',
      },
    });
    const cdnDomain = this.configService?.get<string>('ALIYUN_OSS_CDN_DOMAIN');
    const fileUrl = cdnDomain ? `https://${cdnDomain}/${key}` : result.url;
    return {
      storageKey: key,
      fileUrl,
      mimeType: options.mimeType,
      fileSizeBytes: buffer.length,
    };
  }

  private async saveToLocal(
    tripId: string,
    buffer: Buffer,
    options: { mimeType: string; fileName: string },
  ): Promise<StoredCommsAudio> {
    const dir = join(this.uploadDir, tripId);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    const filePath = join(dir, options.fileName);
    await writeFile(filePath, buffer);
    return {
      storageKey: filePath,
      fileUrl: null,
      mimeType: options.mimeType,
      fileSizeBytes: buffer.length,
    };
  }

  private resolvePublicUrl(storageKey: string, fileUrl: string | null): string {
    if (fileUrl) return fileUrl;
    const baseUrl = this.configService?.get<string>('FILE_STORAGE_BASE_URL');
    if (baseUrl && storageKey.startsWith(this.uploadDir)) {
      const relative = storageKey.replace(this.uploadDir, '').replace(/\\/g, '/');
      return `${baseUrl.replace(/\/$/, '')}/in-trip-comms${relative}`;
    }
    return fileUrl ?? '';
  }

  private isOssKey(storageKey: string): boolean {
    return !storageKey.includes(process.cwd()) && !storageKey.startsWith('/');
  }
}
