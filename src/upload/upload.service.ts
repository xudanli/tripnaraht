import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';

// ali-oss 是 CommonJS 模块
// eslint-disable-next-line @typescript-eslint/no-var-requires
const OSS = require('ali-oss');

export interface UploadResult {
  url: string;
  key: string;
  size: number;
  mimeType: string;
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private ossClient: any = null;

  constructor() {
    this.initOssClient();
  }

  private initOssClient() {
    const region = process.env.ALIYUN_OSS_REGION;
    const accessKeyId = process.env.ALIYUN_OSS_ACCESS_KEY_ID;
    const accessKeySecret = process.env.ALIYUN_OSS_ACCESS_KEY_SECRET;
    const bucket = process.env.ALIYUN_OSS_BUCKET;

    if (region && accessKeyId && accessKeySecret && bucket) {
      this.ossClient = new OSS({
        region,
        accessKeyId,
        accessKeySecret,
        bucket,
      });
      this.logger.log(`✅ 阿里云 OSS 已初始化 (bucket: ${bucket})`);
    } else {
      this.logger.warn('⚠️ 阿里云 OSS 未配置，图片上传功能不可用');
    }
  }

  /**
   * 上传图片到 OSS
   */
  async uploadImage(
    file: Express.Multer.File,
    folder: string = 'places',
  ): Promise<UploadResult> {
    if (!this.ossClient) {
      throw new Error('OSS 未配置，请检查环境变量');
    }

    // 生成唯一文件名
    const ext = path.extname(file.originalname) || '.jpg';
    const filename = `${uuidv4()}${ext}`;
    const key = `${folder}/${filename}`;

    try {
      // 上传到 OSS
      const result = await this.ossClient.put(key, file.buffer, {
        headers: {
          'Content-Type': file.mimetype,
          'Cache-Control': 'max-age=31536000', // 1年缓存
        },
      });

      const cdnDomain = process.env.ALIYUN_OSS_CDN_DOMAIN;
      const url = cdnDomain 
        ? `https://${cdnDomain}/${key}`
        : result.url;

      this.logger.log(`✅ 图片上传成功: ${key}`);

      return {
        url,
        key,
        size: file.size,
        mimeType: file.mimetype,
      };
    } catch (error: any) {
      this.logger.error(`❌ 图片上传失败: ${error.message}`);
      throw new Error(`图片上传失败: ${error.message}`);
    }
  }

  /**
   * 批量上传图片
   */
  async uploadImages(
    files: Express.Multer.File[],
    folder: string = 'places',
  ): Promise<UploadResult[]> {
    const results: UploadResult[] = [];
    
    for (const file of files) {
      const result = await this.uploadImage(file, folder);
      results.push(result);
    }
    
    return results;
  }

  /**
   * 删除 OSS 上的图片
   */
  async deleteImage(key: string): Promise<void> {
    if (!this.ossClient) {
      throw new Error('OSS 未配置');
    }

    try {
      await this.ossClient.delete(key);
      this.logger.log(`✅ 图片删除成功: ${key}`);
    } catch (error: any) {
      this.logger.error(`❌ 图片删除失败: ${error.message}`);
      throw new Error(`图片删除失败: ${error.message}`);
    }
  }

  /**
   * 检查 OSS 是否可用
   */
  isAvailable(): boolean {
    return this.ossClient !== null;
  }
}
