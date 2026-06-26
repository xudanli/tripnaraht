import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const OSS = require('ali-oss');

export type StoredDocumentFile = {
  storageKey: string;
  fileUrl: string | null;
  fileSize: number;
};

@Injectable()
export class IdentityDocumentStorageService {
  private readonly logger = new Logger(IdentityDocumentStorageService.name);
  private readonly uploadDir: string;
  private ossClient: unknown = null;
  private readonly ossFolder = 'identity-governance/documents';

  constructor(@Optional() private readonly configService?: ConfigService) {
    this.uploadDir =
      this.configService?.get<string>('IDENTITY_DOC_UPLOAD_DIR') ||
      join(process.cwd(), 'uploads', 'identity-governance', 'documents');
    this.initOssClient();
  }

  private initOssClient(): void {
    const region =
      this.configService?.get<string>('IDENTITY_OSS_REGION') ||
      this.configService?.get<string>('ALIYUN_OSS_REGION');
    const accessKeyId =
      this.configService?.get<string>('IDENTITY_OSS_ACCESS_KEY_ID') ||
      this.configService?.get<string>('ALIYUN_OSS_ACCESS_KEY_ID');
    const accessKeySecret =
      this.configService?.get<string>('IDENTITY_OSS_ACCESS_KEY_SECRET') ||
      this.configService?.get<string>('ALIYUN_OSS_ACCESS_KEY_SECRET');
    const bucket =
      this.configService?.get<string>('IDENTITY_OSS_BUCKET') ||
      this.configService?.get<string>('ALIYUN_OSS_BUCKET');

    if (region && accessKeyId && accessKeySecret && bucket) {
      this.ossClient = new OSS({ region, accessKeyId, accessKeySecret, bucket });
      this.logger.log(`Identity document OSS ready (bucket: ${bucket})`);
    } else {
      this.logger.warn('Identity document OSS not configured — using local storage');
    }
  }

  async save(buffer: Buffer, originalName: string, mimeType: string): Promise<StoredDocumentFile> {
    const ext = originalName.includes('.') ? `.${originalName.split('.').pop()}` : '';
    const fileName = `${randomUUID()}${ext}`;

    if (this.ossClient) {
      const key = `${this.ossFolder}/${fileName}`;
      const client = this.ossClient as {
        put: (k: string, b: Buffer, o: { headers: Record<string, string> }) => Promise<{ url: string }>;
      };
      const result = await client.put(key, buffer, {
        headers: { 'Content-Type': mimeType, 'Cache-Control': 'private, max-age=3600' },
      });
      const cdnDomain =
        this.configService?.get<string>('IDENTITY_OSS_CDN_DOMAIN') ||
        this.configService?.get<string>('ALIYUN_OSS_CDN_DOMAIN');
      const fileUrl = cdnDomain ? `https://${cdnDomain}/${key}` : result.url;
      return { storageKey: key, fileUrl, fileSize: buffer.length };
    }

    if (!existsSync(this.uploadDir)) {
      await mkdir(this.uploadDir, { recursive: true });
    }
    const filePath = join(this.uploadDir, fileName);
    await writeFile(filePath, buffer);
    return { storageKey: filePath, fileUrl: null, fileSize: buffer.length };
  }
}
