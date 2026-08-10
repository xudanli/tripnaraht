import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { writeFile, mkdir, unlink } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';

export interface StoredCredentialFile {
  storageKey: string;
  fileUrl: string | null;
  fileSizeBytes: number;
}

const SIGNED_URL_TTL_SEC = 600; // 10 minutes

@Injectable()
export class MobileCredentialDocumentStorageService {
  private readonly logger = new Logger(MobileCredentialDocumentStorageService.name);
  private readonly uploadDir: string;
  private readonly ossFolder = 'user-credentials';
  private ossClient: unknown = null;

  constructor(@Optional() private readonly configService?: ConfigService) {
    this.uploadDir =
      this.configService?.get<string>('USER_CREDENTIALS_UPLOAD_DIR') ??
      join(process.cwd(), 'uploads', 'user-credentials');
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
      this.logger.log(`User credential docs OSS ready (bucket: ${bucket})`);
    } else {
      this.logger.warn('OSS not configured — credential docs will use local storage');
    }
  }

  async save(
    userId: string,
    buffer: Buffer,
    originalName: string,
    mimeType: string,
  ): Promise<StoredCredentialFile> {
    const ext = originalName.includes('.') ? `.${originalName.split('.').pop()}` : '';
    const fileName = `${randomUUID()}${ext}`;
    const relative = `${userId}/${fileName}`;

    if (this.ossClient) {
      return this.saveToOss(relative, buffer, mimeType);
    }
    return this.saveToLocal(userId, fileName, buffer);
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

  async signDownloadUrl(storageKey: string, fileUrl: string | null): Promise<{
    url: string;
    expiresAt: string;
  }> {
    const expiresAt = new Date(Date.now() + SIGNED_URL_TTL_SEC * 1000).toISOString();
    if (this.ossClient && this.isOssKey(storageKey)) {
      const url = (
        this.ossClient as { signatureUrl: (k: string, o: { expires: number }) => string }
      ).signatureUrl(storageKey, { expires: SIGNED_URL_TTL_SEC });
      return { url, expiresAt };
    }
    return { url: this.resolveDownloadUrl(storageKey, fileUrl), expiresAt };
  }

  private resolveDownloadUrl(storageKey: string, fileUrl: string | null): string {
    if (fileUrl) return fileUrl;
    const baseUrl = this.configService?.get<string>('FILE_STORAGE_BASE_URL');
    if (baseUrl) {
      const relative = storageKey.replace(this.uploadDir, '').replace(/\\/g, '/');
      return `${baseUrl}${relative}`;
    }
    return storageKey;
  }

  private async saveToOss(
    relative: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<StoredCredentialFile> {
    const key = `${this.ossFolder}/${relative}`;
    const client = this.ossClient as {
      put: (
        k: string,
        b: Buffer,
        o: { headers: Record<string, string> },
      ) => Promise<{ url: string }>;
    };
    const result = await client.put(key, buffer, {
      headers: { 'Content-Type': mimeType, 'Cache-Control': 'private, max-age=600' },
    });
    return {
      storageKey: key,
      fileUrl: result.url,
      fileSizeBytes: buffer.length,
    };
  }

  private async saveToLocal(
    userId: string,
    fileName: string,
    buffer: Buffer,
  ): Promise<StoredCredentialFile> {
    const dir = join(this.uploadDir, userId);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
    const filePath = join(dir, fileName);
    await writeFile(filePath, buffer);
    return {
      storageKey: filePath,
      fileUrl: null,
      fileSizeBytes: buffer.length,
    };
  }

  private isOssKey(storageKey: string): boolean {
    return storageKey.startsWith(`${this.ossFolder}/`);
  }
}
