// src/contact/services/file-storage.service.ts
import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';

export interface UploadedFileInfo {
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);
  private readonly uploadDir: string;

  constructor(@Optional() private configService?: ConfigService) {
    // 从环境变量获取上传目录，默认为 uploads/contact
    this.uploadDir = this.configService?.get<string>('CONTACT_UPLOAD_DIR') || 
                     join(process.cwd(), 'uploads', 'contact');
    
    // 确保上传目录存在
    this.ensureUploadDir().catch(error => {
      this.logger.error(`创建上传目录失败: ${error.message}`);
    });
  }

  /**
   * 确保上传目录存在
   */
  private async ensureUploadDir(): Promise<void> {
    if (!existsSync(this.uploadDir)) {
      await mkdir(this.uploadDir, { recursive: true });
      this.logger.log(`创建上传目录: ${this.uploadDir}`);
    }
  }

  /**
   * 保存文件
   */
  async saveFile(
    buffer: Buffer,
    originalName: string,
    mimeType: string
  ): Promise<UploadedFileInfo> {
    await this.ensureUploadDir();

    // 生成唯一文件名：UUID + 原始扩展名
    const ext = originalName.split('.').pop() || '';
    const fileName = `${randomUUID()}${ext ? '.' + ext : ''}`;
    const filePath = join(this.uploadDir, fileName);

    // 写入文件
    await writeFile(filePath, buffer);

    this.logger.debug(`文件已保存: ${filePath}`);

    return {
      filePath,
      fileName: originalName, // 保留原始文件名
      fileSize: buffer.length,
      mimeType,
    };
  }

  /**
   * 获取文件的公开访问 URL（如果配置了）
   * 当前返回相对路径，可以扩展为对象存储 URL
   */
  getFileUrl(filePath: string): string {
    // 如果配置了对象存储基础 URL，返回完整 URL
    const baseUrl = this.configService.get<string>('FILE_STORAGE_BASE_URL');
    if (baseUrl) {
      const relativePath = filePath.replace(this.uploadDir, '').replace(/\\/g, '/');
      return `${baseUrl}${relativePath}`;
    }
    
    // 否则返回相对路径（需要前端配置静态文件服务）
    const relativePath = filePath.replace(process.cwd(), '').replace(/\\/g, '/');
    return relativePath;
  }
}
