import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';

export interface StoredTripFile {
  storageKey: string;
  fileUrl: string | null;
  fileSizeBytes: number;
}

@Injectable()
export class TripFileStorageService {
  private readonly logger = new Logger(TripFileStorageService.name);
  private readonly uploadDir: string;
  private readonly ossFolder = 'trip-files';
  private ossClient: unknown = null;

  constructor(@Optional() private readonly configService?: ConfigService) {
    this.uploadDir =
      this.configService?.get<string>('TRIP_FILES_UPLOAD_DIR') ??
      join(process.cwd(), 'uploads', 'trip-files');
    this.initOssClient();
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
      this.logger.log(`Trip files OSS ready (bucket: ${bucket})`);
    } else {
      this.logger.warn('OSS not configured — trip files will use local storage');
    }
  }

  async save(
    buffer: Buffer,
    originalName: string,
    mimeType: string,
  ): Promise<StoredTripFile> {
    const ext = originalName.includes('.') ? `.${originalName.split('.').pop()}` : '';
    const fileName = `${randomUUID()}${ext}`;

    if (this.ossClient) {
      return this.saveToOss(buffer, fileName, mimeType);
    }
    return this.saveToLocal(buffer, fileName);
  }

  async delete(storageKey: string): Promise<void> {
    if (this.ossClient && this.isOssKey(storageKey)) {
      await (this.ossClient as { delete: (k: string) => Promise<void> }).delete(storageKey);
      return;
    }
    if (existsSync(storageKey)) {
      await unlink(storageKey);
    }
  }

  resolveDownloadUrl(storageKey: string, fileUrl: string | null): string {
    if (fileUrl) {
      return fileUrl;
    }
    if (this.isOssKey(storageKey)) {
      const cdnDomain = this.configService?.get<string>('ALIYUN_OSS_CDN_DOMAIN');
      if (cdnDomain) {
        return `https://${cdnDomain}/${storageKey}`;
      }
    }
    const baseUrl = this.configService?.get<string>('FILE_STORAGE_BASE_URL');
    if (baseUrl) {
      const relative = storageKey.replace(this.uploadDir, '').replace(/\\/g, '/');
      return `${baseUrl}${relative}`;
    }
    return storageKey;
  }

  async signDownloadUrl(storageKey: string, fileUrl: string | null): Promise<string> {
    if (this.ossClient && this.isOssKey(storageKey)) {
      return (this.ossClient as { signatureUrl: (k: string, o: { expires: number }) => string }).signatureUrl(
        storageKey,
        { expires: 3600 },
      );
    }
    return this.resolveDownloadUrl(storageKey, fileUrl);
  }

  private async saveToOss(
    buffer: Buffer,
    fileName: string,
    mimeType: string,
  ): Promise<StoredTripFile> {
    const key = `${this.ossFolder}/${fileName}`;
    const client = this.ossClient as {
      put: (k: string, b: Buffer, o: { headers: Record<string, string> }) => Promise<{ url: string }>;
    };
    const result = await client.put(key, buffer, {
      headers: { 'Content-Type': mimeType, 'Cache-Control': 'private, max-age=3600' },
    });
    const cdnDomain = this.configService?.get<string>('ALIYUN_OSS_CDN_DOMAIN');
    const fileUrl = cdnDomain ? `https://${cdnDomain}/${key}` : result.url;
    return { storageKey: key, fileUrl, fileSizeBytes: buffer.length };
  }

  private async saveToLocal(buffer: Buffer, fileName: string): Promise<StoredTripFile> {
    if (!existsSync(this.uploadDir)) {
      await mkdir(this.uploadDir, { recursive: true });
    }
    const filePath = join(this.uploadDir, fileName);
    await writeFile(filePath, buffer);
    return { storageKey: filePath, fileUrl: null, fileSizeBytes: buffer.length };
  }

  private isOssKey(storageKey: string): boolean {
    return !storageKey.includes(process.cwd()) && !storageKey.startsWith('/');
  }
}
