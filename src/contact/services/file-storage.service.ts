// src/contact/services/file-storage.service.ts
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';

// ali-oss 是 CommonJS 模块
// eslint-disable-next-line @typescript-eslint/no-var-requires
const OSS = require('ali-oss');

export interface UploadedFileInfo {
  filePath: string;  // OSS key 或本地文件路径
  fileName: string;  // 原始文件名
  fileSize: number;
  mimeType: string;
  url?: string;      // OSS 访问 URL（仅 OSS 模式）
}

@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);
  private readonly uploadDir: string;
  private ossClient: any = null;
  private readonly ossFolder = 'contact';  // OSS 存储文件夹
  private readonly ossBucket: string | undefined;

  constructor(@Optional() private configService?: ConfigService) {
    // 从环境变量获取上传目录，默认为 uploads/contact
    this.uploadDir = this.configService?.get<string>('CONTACT_UPLOAD_DIR') || 
                     join(process.cwd(), 'uploads', 'contact');
    
    // 初始化 OSS 客户端
    this.initOssClient();
    
    // 如果 OSS 未配置，确保本地上传目录存在
    if (!this.ossClient) {
      this.ensureUploadDir().catch(error => {
        this.logger.error(`创建上传目录失败: ${error.message}`);
      });
    }
  }

  /**
   * 初始化阿里云 OSS 客户端
   */
  private initOssClient(): void {
    // 优先使用 contact 专用配置，否则使用通用 OSS 配置
    const region = this.configService?.get<string>('CONTACT_OSS_REGION') || 
                   this.configService?.get<string>('ALIYUN_OSS_REGION');
    const accessKeyId = this.configService?.get<string>('CONTACT_OSS_ACCESS_KEY_ID') || 
                        this.configService?.get<string>('ALIYUN_OSS_ACCESS_KEY_ID');
    const accessKeySecret = this.configService?.get<string>('CONTACT_OSS_ACCESS_KEY_SECRET') || 
                            this.configService?.get<string>('ALIYUN_OSS_ACCESS_KEY_SECRET');
    // Contact 模块使用 tripnara-contact bucket
    const bucket = this.configService?.get<string>('CONTACT_OSS_BUCKET') || 'tripnara-contact';

    if (region && accessKeyId && accessKeySecret && bucket) {
      try {
        this.ossClient = new OSS({
          region,
          accessKeyId,
          accessKeySecret,
          bucket,
        });
        (this as any).ossBucket = bucket;
        this.logger.log(`✅ Contact OSS 已初始化 (bucket: ${bucket}, folder: ${this.ossFolder})`);
      } catch (error: any) {
        this.logger.error(`❌ OSS 初始化失败: ${error.message}`);
        this.ossClient = null;
      }
    } else {
      this.logger.warn('⚠️ Contact OSS 未配置，将使用本地存储（生产环境请配置 OSS）');
    }
  }

  /**
   * 确保上传目录存在（本地存储模式）
   */
  private async ensureUploadDir(): Promise<void> {
    if (!existsSync(this.uploadDir)) {
      await mkdir(this.uploadDir, { recursive: true });
      this.logger.log(`创建本地上传目录: ${this.uploadDir}`);
    }
  }

  /**
   * 保存文件到 OSS 或本地存储
   */
  async saveFile(
    buffer: Buffer,
    originalName: string,
    mimeType: string
  ): Promise<UploadedFileInfo> {
    // 生成唯一文件名：UUID + 原始扩展名
    const ext = originalName.split('.').pop() || '';
    const fileName = `${randomUUID()}${ext ? '.' + ext : ''}`;

    // 优先使用 OSS 存储
    if (this.ossClient) {
      return this.saveToOss(buffer, fileName, originalName, mimeType);
    }

    // 降级到本地存储
    return this.saveToLocal(buffer, fileName, originalName, mimeType);
  }

  /**
   * 上传文件到阿里云 OSS
   */
  private async saveToOss(
    buffer: Buffer,
    fileName: string,
    originalName: string,
    mimeType: string
  ): Promise<UploadedFileInfo> {
    const key = `${this.ossFolder}/${fileName}`;

    try {
      const result = await this.ossClient.put(key, buffer, {
        headers: {
          'Content-Type': mimeType,
          'Cache-Control': 'max-age=31536000', // 1年缓存
        },
      });

      // 获取 CDN 域名或使用默认 URL
      const cdnDomain = this.configService?.get<string>('CONTACT_OSS_CDN_DOMAIN') ||
                        this.configService?.get<string>('ALIYUN_OSS_CDN_DOMAIN');
      const url = cdnDomain 
        ? `https://${cdnDomain}/${key}`
        : result.url;

      this.logger.log(`✅ 文件上传到 OSS 成功: ${key}`);

      return {
        filePath: key,        // 存储 OSS key
        fileName: originalName,
        fileSize: buffer.length,
        mimeType,
        url,
      };
    } catch (error: any) {
      this.logger.error(`❌ OSS 上传失败: ${error.message}`);
      
      // OSS 上传失败，降级到本地存储
      this.logger.warn('OSS 上传失败，降级到本地存储');
      return this.saveToLocal(buffer, fileName, originalName, mimeType);
    }
  }

  /**
   * 保存文件到本地存储（降级方案）
   */
  private async saveToLocal(
    buffer: Buffer,
    fileName: string,
    originalName: string,
    mimeType: string
  ): Promise<UploadedFileInfo> {
    await this.ensureUploadDir();

    const filePath = join(this.uploadDir, fileName);
    await writeFile(filePath, buffer);

    this.logger.debug(`文件已保存到本地: ${filePath}`);

    return {
      filePath,
      fileName: originalName,
      fileSize: buffer.length,
      mimeType,
    };
  }

  /**
   * 获取文件的公开访问 URL
   */
  getFileUrl(filePath: string): string {
    // 如果是 OSS key（不包含本地路径分隔符），生成 OSS URL
    if (!filePath.includes(process.cwd()) && !filePath.startsWith('/')) {
      const cdnDomain = this.configService?.get<string>('CONTACT_OSS_CDN_DOMAIN') ||
                        this.configService?.get<string>('ALIYUN_OSS_CDN_DOMAIN');
      const bucket = this.configService?.get<string>('CONTACT_OSS_BUCKET') || 'tripnara-contact';
      const region = this.configService?.get<string>('CONTACT_OSS_REGION') || 
                     this.configService?.get<string>('ALIYUN_OSS_REGION');
      
      if (cdnDomain) {
        return `https://${cdnDomain}/${filePath}`;
      }
      
      if (region && bucket) {
        return `https://${bucket}.${region}.aliyuncs.com/${filePath}`;
      }
    }

    // 本地文件：如果配置了文件服务基础 URL，返回完整 URL
    const baseUrl = this.configService?.get<string>('FILE_STORAGE_BASE_URL');
    if (baseUrl) {
      const relativePath = filePath.replace(this.uploadDir, '').replace(/\\/g, '/');
      return `${baseUrl}${relativePath}`;
    }
    
    // 否则返回相对路径
    const relativePath = filePath.replace(process.cwd(), '').replace(/\\/g, '/');
    return relativePath;
  }

  /**
   * 删除 OSS 上的文件
   */
  async deleteFile(filePath: string): Promise<boolean> {
    // 如果是 OSS key
    if (this.ossClient && !filePath.includes(process.cwd()) && !filePath.startsWith('/')) {
      try {
        await this.ossClient.delete(filePath);
        this.logger.log(`✅ OSS 文件删除成功: ${filePath}`);
        return true;
      } catch (error: any) {
        this.logger.error(`❌ OSS 文件删除失败: ${error.message}`);
        return false;
      }
    }

    // 本地文件删除
    try {
      const { unlink } = await import('fs/promises');
      await unlink(filePath);
      this.logger.log(`✅ 本地文件删除成功: ${filePath}`);
      return true;
    } catch (error: any) {
      this.logger.error(`❌ 本地文件删除失败: ${error.message}`);
      return false;
    }
  }

  /**
   * 检查 OSS 是否可用
   */
  isOssAvailable(): boolean {
    return this.ossClient !== null;
  }
}
