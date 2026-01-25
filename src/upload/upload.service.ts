import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import axios, { AxiosInstance } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as https from 'https';

// Multer file type
interface MulterFile {
  buffer: Buffer;
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
}

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
  private httpClient: AxiosInstance | null = null;

  constructor() {
    this.initOssClient();
    this.initHttpClient();
  }

  /**
   * 初始化 HTTP 客户端（支持代理）
   */
  private initHttpClient() {
    // 检查代理环境变量
    const proxyUrl =
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.ALL_PROXY ||
      process.env.all_proxy;

    // 创建 HTTPS Agent（如果代理不可用，使用直接连接）
    let httpsAgent: https.Agent | HttpsProxyAgent<string>;
    if (proxyUrl) {
      try {
        httpsAgent = new HttpsProxyAgent<string>(proxyUrl);
        this.logger.debug(`HTTP 客户端已初始化（使用代理: ${proxyUrl})`);
      } catch (error: any) {
        this.logger.warn(`代理配置失败，使用直接连接: ${error.message}`);
        httpsAgent = new https.Agent({
          keepAlive: true,
          family: 4, // 强制 IPv4
          rejectUnauthorized: true,
        });
      }
    } else {
      httpsAgent = new https.Agent({
        keepAlive: true,
        family: 4, // 强制 IPv4
        rejectUnauthorized: true,
      });
      this.logger.debug('HTTP 客户端已初始化（直接连接）');
    }

    this.httpClient = axios.create({
      timeout: 30000, // 30秒超时
      httpsAgent,
      proxy: false, // 禁用 axios 的代理（使用 httpsAgent 处理）
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; TripNara/1.0)',
      },
    });
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
    file: MulterFile,
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
    files: MulterFile[],
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
   * 从 URL 下载图片并上传到 OSS
   */
  async uploadImageFromUrl(
    imageUrl: string,
    folder: string = 'places',
    filename?: string,
  ): Promise<UploadResult> {
    if (!this.ossClient) {
      throw new Error('OSS 未配置，请检查环境变量');
    }

    const maxRetries = 3;
    const timeoutMs = 30000; // 30秒超时
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 下载图片
        this.logger.debug(`正在下载图片 (尝试 ${attempt}/${maxRetries}): ${imageUrl}`);
        
        // 使用 axios 下载图片（支持代理）
        const response = await this.httpClient!.get(imageUrl, {
          responseType: 'arraybuffer',
          timeout: timeoutMs,
        });

        if (response.status !== 200) {
          throw new Error(`下载图片失败: ${response.status} ${response.statusText}`);
        }

        // 获取图片数据
        const buffer = Buffer.from(response.data);

        // 获取 Content-Type
        const contentType = response.headers['content-type'] || 'image/jpeg';
        
        // 从 URL 推断文件扩展名
        let ext = '.jpg';
        if (contentType.includes('png')) {
          ext = '.png';
        } else if (contentType.includes('webp')) {
          ext = '.webp';
        } else if (contentType.includes('gif')) {
          ext = '.gif';
        }

        // 生成文件名
        const finalFilename = filename || `${uuidv4()}${ext}`;
        const key = `${folder}/${finalFilename}`;

        // 上传到 OSS
        const result = await this.ossClient.put(key, buffer, {
          headers: {
            'Content-Type': contentType,
            'Cache-Control': 'max-age=31536000', // 1年缓存
          },
        });

        const cdnDomain = process.env.ALIYUN_OSS_CDN_DOMAIN;
        const url = cdnDomain 
          ? `https://${cdnDomain}/${key}`
          : result.url;

        this.logger.log(`✅ 图片上传成功: ${key} (从 ${imageUrl})`);

        return {
          url,
          key,
          size: buffer.length,
          mimeType: contentType,
        };
      } catch (error: any) {
        lastError = error;
        
        // 如果是代理连接失败，立即重新初始化客户端（使用直接连接）
        if ((error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) && attempt === 1) {
          this.logger.warn('代理连接失败，切换到直接连接');
          // 临时禁用代理环境变量，重新初始化
          const originalProxy = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.ALL_PROXY || process.env.all_proxy;
          if (originalProxy) {
            delete process.env.HTTPS_PROXY;
            delete process.env.https_proxy;
            delete process.env.ALL_PROXY;
            delete process.env.all_proxy;
            this.initHttpClient();
            // 恢复环境变量（不影响其他服务）
            if (originalProxy) {
              process.env.HTTPS_PROXY = originalProxy;
            }
          }
        }
        
        // 判断是否应该重试
        const isRetryable = 
          error.message?.includes('fetch failed') ||
          error.message?.includes('timeout') ||
          error.message?.includes('超时') ||
          error.message?.includes('ECONNABORTED') ||
          error.message?.includes('ECONNRESET') ||
          error.message?.includes('ENOTFOUND') ||
          error.message?.includes('ETIMEDOUT') ||
          error.message?.includes('ECONNREFUSED') ||
          error.code === 'ECONNABORTED' ||
          error.code === 'ECONNRESET' ||
          error.code === 'ENOTFOUND' ||
          error.code === 'ETIMEDOUT' ||
          error.code === 'ECONNREFUSED';

        if (!isRetryable || attempt === maxRetries) {
          // 不可重试的错误或已达到最大重试次数
          this.logger.error(`❌ 从 URL 上传图片失败: ${error.message}`);
          throw new Error(`从 URL 上传图片失败: ${error.message}`);
        }

        // 指数退避重试
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        this.logger.warn(
          `[OSS] 下载失败 (尝试 ${attempt}/${maxRetries}): ${error.message}，${backoffMs}ms 后重试`
        );
        await this.delay(backoffMs);
      }
    }

    // 理论上不会到达这里
    throw lastError || new Error('未知错误');
  }

  /**
   * 延迟
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 检查 OSS 是否可用
   */
  isAvailable(): boolean {
    return this.ossClient !== null;
  }
}
