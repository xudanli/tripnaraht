// src/contact/services/contact.service.ts
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FileStorageService } from './file-storage.service';
import { RateLimitService } from './rate-limit.service';
import { ContactNotificationService } from './contact-notification.service';
import { randomUUID } from 'crypto';

export interface MulterFile {
  buffer: Buffer;
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
}

// 支持的图片 MIME 类型
const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
];

// 最大文件大小：5MB
const MAX_FILE_SIZE = 5 * 1024 * 1024;

// 最多上传图片数量
const MAX_IMAGE_COUNT = 5;

@Injectable()
export class ContactService {
  private readonly logger = new Logger(ContactService.name);

  constructor(
    private prisma: PrismaService,
    private fileStorage: FileStorageService,
    private rateLimit: RateLimitService,
    private notification: ContactNotificationService,
  ) {}

  /**
   * 验证文件
   */
  private validateFile(file: MulterFile): void {
    // 验证文件类型
    if (!ALLOWED_IMAGE_TYPES.includes(file.mimetype)) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'INVALID_FILE_TYPE',
          message: '不支持的图片格式，仅支持 jpg, jpeg, png, gif, webp',
        },
      });
    }

    // 验证文件大小
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'FILE_TOO_LARGE',
          message: '图片文件过大，单个文件不能超过 5MB',
        },
      });
    }
  }

  /**
   * 创建联系消息
   */
  async createContactMessage(
    message: string | undefined,
    files: MulterFile[] | undefined,
    userId?: string,
    ipAddress?: string,
  ): Promise<{ id: string; success: boolean; message: string }> {
    // 验证：消息和图片至少需要一个
    if ((!message || message.trim().length === 0) && (!files || files.length === 0)) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: '消息和图片不能同时为空',
        },
      });
    }

    // 验证图片数量
    if (files && files.length > MAX_IMAGE_COUNT) {
      throw new BadRequestException({
        success: false,
        error: {
          code: 'TOO_MANY_FILES',
          message: `最多只能上传 ${MAX_IMAGE_COUNT} 张图片`,
        },
      });
    }

    // 验证所有文件
    if (files && files.length > 0) {
      for (const file of files) {
        this.validateFile(file);
      }
    }

    // 检查限流
    await this.rateLimit.checkRateLimit(userId, ipAddress);

    try {
      // 保存图片文件
      const imageRecords = [];
      if (files && files.length > 0) {
        for (const file of files) {
          const fileInfo = await this.fileStorage.saveFile(
            file.buffer,
            file.originalname,
            file.mimetype,
          );

          imageRecords.push({
            filePath: fileInfo.filePath,
            fileName: fileInfo.fileName,
            fileSize: BigInt(fileInfo.fileSize),
            mimeType: fileInfo.mimeType,
          });
        }
      }

      // 创建数据库记录
      const contactMessage = await this.prisma.contactMessage.create({
        data: {
          id: randomUUID(),
          userId: userId || null,
          message: message?.trim() || null,
          status: 'pending',
          images: {
            create: imageRecords,
          },
        },
        include: {
          images: true,
        },
      });

      this.logger.log(`联系消息已创建: id=${contactMessage.id}, userId=${userId || 'anonymous'}, imageCount=${imageRecords.length}`);

      // 异步发送通知邮件（不阻塞响应）
      const imageUrls = contactMessage.images.map((img: any) => 
        this.fileStorage.getFileUrl(img.filePath)
      );
      
      this.notification.sendNotificationEmail(
        contactMessage.id,
        contactMessage.message || null,
        contactMessage.userId || null,
        contactMessage.images.length,
        imageUrls,
      ).catch(error => {
        this.logger.error(`发送通知邮件失败: ${error.message}`);
      });

      return {
        id: contactMessage.id,
        success: true,
        message: '消息发送成功',
      };
    } catch (error: any) {
      this.logger.error(`创建联系消息失败: ${error.message}`, error.stack);
      
      // 如果是我们自定义的 BadRequestException，直接抛出
      if (error instanceof BadRequestException) {
        throw error;
      }

      // 其他错误，包装为内部错误
      throw new BadRequestException({
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: '服务器内部错误，请稍后重试',
        },
      });
    }
  }
}
