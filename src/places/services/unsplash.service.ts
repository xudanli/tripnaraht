// src/places/services/unsplash.service.ts

import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as https from 'https';

/**
 * Unsplash 图片数据
 */
export interface UnsplashPhoto {
  id: string;
  width: number;
  height: number;
  color: string;
  blurHash: string;
  description: string | null;
  altDescription: string | null;
  urls: {
    raw: string;
    full: string;
    regular: string;  // 1080px 宽
    small: string;    // 400px 宽
    thumb: string;    // 200px 宽
  };
  links: {
    html: string;     // Unsplash 页面链接（用于归属）
    download: string;
  };
  user: {
    name: string;
    username: string;
    link: string;     // 摄影师主页
  };
  // Unsplash API 要求的归属信息
  attribution: {
    photographerName: string;
    photographerUrl: string;
    unsplashUrl: string;
  };
}

/**
 * 地点图片请求
 */
export interface PlaceImageRequest {
  placeId?: string;        // 可选：地点 ID（用于缓存）
  placeName: string;       // 地点名称（中文或英文）
  placeNameEn?: string;    // 英文名称（优先用于搜索）
  country?: string;        // 国家（辅助搜索）
  category?: string;       // 类别：landmark, nature, restaurant, hotel
}

/**
 * 地点图片响应
 */
export interface PlaceImageResult {
  placeId?: string;
  placeName: string;
  photo: UnsplashPhoto | null;
  cached: boolean;
  error?: string;
}

/**
 * 批量请求响应
 */
export interface BatchImageResponse {
  success: boolean;
  results: PlaceImageResult[];
  stats: {
    total: number;
    found: number;
    cached: number;
    failed: number;
  };
  processingTimeMs: number;
}

@Injectable()
export class UnsplashService implements OnModuleInit {
  private readonly logger = new Logger(UnsplashService.name);
  private accessKey: string;
  private readonly baseUrl = 'https://api.unsplash.com';
  private httpClient: AxiosInstance | null = null;
  
  // 内存缓存（生产环境应使用 Redis）
  private cache: Map<string, { photo: UnsplashPhoto; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 小时
  
  // 速率限制
  private requestCount = 0;
  private readonly MAX_REQUESTS_PER_HOUR = 50; // Unsplash 免费版限制
  private lastResetTime = Date.now();

  constructor(@Optional() private readonly configService?: ConfigService) {
    this.accessKey = this.configService?.get<string>('UNSPLASH_ACCESS_KEY') || '';
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

    // 创建 HTTPS Agent
    let httpsAgent: https.Agent | HttpsProxyAgent<string>;
    if (proxyUrl) {
      try {
        httpsAgent = new HttpsProxyAgent<string>(proxyUrl);
        this.logger.debug(`Unsplash HTTP 客户端已初始化（使用代理: ${proxyUrl})`);
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
    }

    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: 20000, // 20秒超时（增加超时时间）
      httpsAgent,
      proxy: false, // 禁用 axios 的代理（使用 httpsAgent 处理）
      headers: {
        'Accept-Version': 'v1',
      },
      // 添加请求拦截器，确保 Authorization header 正确设置
      validateStatus: (status) => status < 500, // 允许 4xx 状态码，在业务逻辑中处理
    });

    // 添加请求拦截器，确保每次请求都包含 Authorization
    this.httpClient.interceptors.request.use((config) => {
      if (this.accessKey && !config.headers['Authorization']) {
        config.headers['Authorization'] = `Client-ID ${this.accessKey}`;
      }
      return config;
    });
  }

  onModuleInit() {
    if (!this.accessKey) {
      this.logger.warn('⚠️ UNSPLASH_ACCESS_KEY 未配置，图片服务将返回空结果');
    } else {
      this.logger.log('✅ Unsplash 服务已初始化');
    }
  }

  /**
   * 批量获取地点图片
   */
  async getBatchPlaceImages(places: PlaceImageRequest[]): Promise<BatchImageResponse> {
    const startTime = Date.now();
    const results: PlaceImageResult[] = [];
    let found = 0;
    let cached = 0;
    let failed = 0;

    // 并发限制：每次最多 5 个请求
    const BATCH_SIZE = 5;
    
    for (let i = 0; i < places.length; i += BATCH_SIZE) {
      const batch = places.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(place => this.getPlaceImage(place))
      );
      
      for (const result of batchResults) {
        results.push(result);
        if (result.photo) {
          found++;
          if (result.cached) cached++;
        } else if (result.error) {
          failed++;
        }
      }
      
      // 批次间延迟，避免触发速率限制
      if (i + BATCH_SIZE < places.length) {
        await this.delay(200);
      }
    }

    return {
      success: failed < places.length,
      results,
      stats: {
        total: places.length,
        found,
        cached,
        failed,
      },
      processingTimeMs: Date.now() - startTime,
    };
  }

  /**
   * 获取单个地点的图片
   */
  async getPlaceImage(place: PlaceImageRequest): Promise<PlaceImageResult> {
    const cacheKey = this.buildCacheKey(place);
    
    // 检查缓存
    const cachedResult = this.getFromCache(cacheKey);
    if (cachedResult) {
      return {
        placeId: place.placeId,
        placeName: place.placeName,
        photo: cachedResult,
        cached: true,
      };
    }

    // 检查 API 配置
    if (!this.accessKey) {
      return {
        placeId: place.placeId,
        placeName: place.placeName,
        photo: null,
        cached: false,
        error: 'Unsplash API 未配置',
      };
    }

    // 检查速率限制
    if (!this.checkRateLimit()) {
      return {
        placeId: place.placeId,
        placeName: place.placeName,
        photo: null,
        cached: false,
        error: '已达到 API 速率限制，请稍后重试',
      };
    }

    try {
      const photo = await this.searchPhoto(place);
      
      if (photo) {
        // 存入缓存
        this.setCache(cacheKey, photo);
        
        return {
          placeId: place.placeId,
          placeName: place.placeName,
          photo,
          cached: false,
        };
      } else {
        return {
          placeId: place.placeId,
          placeName: place.placeName,
          photo: null,
          cached: false,
          error: '未找到相关图片',
        };
      }
    } catch (error: any) {
      const errorMessage = error.message || '未知错误';
      const errorCode = error.code || (error.isAxiosError ? 'AXIOS_ERROR' : '');
      const errorDetails = errorCode ? ` (${errorCode})` : '';
      const statusInfo = error.response?.status ? ` [HTTP ${error.response.status}]` : '';
      
      this.logger.error(
        `获取图片失败 [${place.placeName}]: ${errorMessage}${errorDetails}${statusInfo}`
      );
      
      // 提供更友好的错误消息
      let userFriendlyError = errorMessage;
      if (errorMessage.includes('fetch failed') || errorMessage.includes('ECONNRESET') || errorMessage.includes('ENOTFOUND')) {
        userFriendlyError = '网络连接失败，请检查网络连接或稍后重试';
      } else if (errorMessage.includes('timeout') || errorMessage.includes('超时') || errorCode === 'ECONNABORTED') {
        userFriendlyError = '请求超时，请稍后重试';
      } else if (error.response?.status === 401) {
        userFriendlyError = 'Unsplash API Key 无效';
      } else if (error.response?.status === 403) {
        userFriendlyError = 'Unsplash API 速率限制，请稍后重试';
      }
      
      return {
        placeId: place.placeId,
        placeName: place.placeName,
        photo: null,
        cached: false,
        error: userFriendlyError,
      };
    }
  }

  /**
   * 搜索 Unsplash 图片
   */
  private async searchPhoto(place: PlaceImageRequest): Promise<UnsplashPhoto | null> {
    // 先尝试完整查询
    let query = this.buildSearchQuery(place, false);
    let result = await this.trySearch(query, place);
    
    // 如果完整查询失败，尝试简化查询（只用地名和国家）
    if (!result) {
      this.logger.debug(`[Unsplash] 完整查询无结果，尝试简化查询: ${place.placeName}`);
      query = this.buildSearchQuery(place, true);
      result = await this.trySearch(query, place);
    }
    
    return result;
  }

  /**
   * 执行实际的搜索请求
   */
  private async trySearch(query: string, place: PlaceImageRequest): Promise<UnsplashPhoto | null> {
    this.logger.debug(`[Unsplash] 搜索: ${query}`);
    
    // 确保 httpClient 已初始化
    if (!this.httpClient) {
      this.initHttpClient();
    }
    
    // 重试配置
    const maxRetries = 3;
    const timeoutMs = 20000; // 20秒超时（增加超时时间）
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // 使用 axios 请求（支持代理和更好的超时控制）
        const response = await this.httpClient!.get('/search/photos', {
          params: {
            query: query,
            per_page: 1,
            orientation: 'landscape',
            order_by: 'relevant',
          },
          headers: {
            'Authorization': `Client-ID ${this.accessKey}`,
          },
          timeout: timeoutMs,
        });

        if (response.status !== 200) {
          if (response.status === 401) {
            throw new Error('Unsplash API Key 无效');
          }
          if (response.status === 403) {
            throw new Error('Unsplash API 速率限制');
          }
          throw new Error(`Unsplash API 错误: ${response.status}`);
        }

        const data = response.data as { results?: any[]; total?: number };
        
        if (!data.results || data.results.length === 0) {
          return null;
        }

        const rawPhoto = data.results[0];
        
        // 转换为标准格式
        return this.transformPhoto(rawPhoto);
      } catch (error: any) {
        lastError = error;
        
        // 记录详细错误信息（用于调试）
        const errorInfo = {
          message: error.message || '未知错误',
          code: error.code || '无',
          status: error.response?.status || '无',
          statusText: error.response?.statusText || '无',
          isAxiosError: error.isAxiosError || false,
        };
        this.logger.debug(
          `[Unsplash] 请求错误详情 (尝试 ${attempt}/${maxRetries}): ${JSON.stringify(errorInfo)}`
        );
        
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
          error.code === 'ECONNREFUSED' ||
          (error.isAxiosError && error.code === 'ECONNABORTED') || // axios timeout
          (error.isAxiosError && error.message?.includes('timeout'));

        // 如果是代理连接失败或超时，尝试重新初始化客户端（使用直接连接）
        const isProxyOrTimeoutIssue = 
          (error.code === 'ECONNREFUSED' || error.message?.includes('ECONNREFUSED')) ||
          (error.code === 'ECONNABORTED' && error.isAxiosError) || // axios timeout
          (error.message?.includes('timeout') && attempt === 1);
        
        if (isProxyOrTimeoutIssue && attempt === 1) {
          this.logger.warn(`Unsplash 连接问题（${error.code || error.message}），尝试切换到直接连接`);
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

        if (!isRetryable || attempt === maxRetries) {
          // 不可重试的错误或已达到最大重试次数
          throw error;
        }

        // 指数退避重试
        const backoffMs = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
        this.logger.warn(
          `[Unsplash] 请求失败 (尝试 ${attempt}/${maxRetries}): ${error.message}，${backoffMs}ms 后重试`
        );
        await this.delay(backoffMs);
      }
    }

    // 理论上不会到达这里，但 TypeScript 需要
    throw lastError || new Error('未知错误');
  }

  /**
   * 规范化地名（去除特殊字符，保留基本字母和空格）
   */
  private normalizePlaceName(name: string): string {
    // 将特殊字符转换为 ASCII 等价字符
    const replacements: Record<string, string> = {
      'ý': 'y', 'Ý': 'Y',
      'á': 'a', 'Á': 'A',
      'é': 'e', 'É': 'E',
      'í': 'i', 'Í': 'I',
      'ó': 'o', 'Ó': 'O',
      'ú': 'u', 'Ú': 'U',
      'ð': 'd', 'Ð': 'D',
      'þ': 'th', 'Þ': 'Th',
      'ö': 'o', 'Ö': 'O',
      'ä': 'a', 'Ä': 'A',
      'ü': 'u', 'Ü': 'U',
    };
    
    let normalized = name;
    for (const [special, replacement] of Object.entries(replacements)) {
      normalized = normalized.replace(new RegExp(special, 'g'), replacement);
    }
    
    // 移除多余空格
    return normalized.trim().replace(/\s+/g, ' ');
  }

  /**
   * 国家代码转换为完整国家名
   */
  private getCountryName(countryCode: string): string {
    const countryMap: Record<string, string> = {
      'IS': 'Iceland',
      'US': 'United States',
      'GB': 'United Kingdom',
      'FR': 'France',
      'DE': 'Germany',
      'IT': 'Italy',
      'ES': 'Spain',
      'CN': 'China',
      'JP': 'Japan',
      'KR': 'South Korea',
      'AU': 'Australia',
      'CA': 'Canada',
      'MX': 'Mexico',
      'BR': 'Brazil',
      'IN': 'India',
      'TH': 'Thailand',
      'VN': 'Vietnam',
      'ID': 'Indonesia',
      'MY': 'Malaysia',
      'SG': 'Singapore',
      'PH': 'Philippines',
    };
    
    return countryMap[countryCode.toUpperCase()] || countryCode;
  }

  /**
   * 构建搜索查询
   */
  private buildSearchQuery(place: PlaceImageRequest, simplified: boolean = false): string {
    const parts: string[] = [];
    
    // 优先使用英文名称，并规范化
    let placeName = '';
    if (place.placeNameEn) {
      placeName = this.normalizePlaceName(place.placeNameEn);
    } else {
      placeName = this.normalizePlaceName(place.placeName);
    }
    
    // 如果简化模式，只使用地名的核心部分（去除描述性词汇）
    if (simplified) {
      // 移除常见的描述性词汇
      const descriptiveWords = ['nature baths', 'nature bath', 'baths', 'bath', 'hot spring', 'hot springs'];
      let simplifiedName = placeName.toLowerCase();
      for (const word of descriptiveWords) {
        simplifiedName = simplifiedName.replace(new RegExp(`\\b${word}\\b`, 'gi'), '').trim();
      }
      parts.push(simplifiedName || placeName);
    } else {
      parts.push(placeName);
    }
    
    // 添加国家（帮助定位）
    if (place.country) {
      const countryName = this.getCountryName(place.country);
      if (countryName !== place.country) {
        parts.push(countryName);
      } else {
        parts.push(place.country);
      }
    }
    
    // 根据类别添加关键词（仅在非简化模式下）
    if (!simplified && place.category) {
      const categoryKeywords: Record<string, string> = {
        landmark: 'landmark travel',
        nature: 'nature landscape scenic',
        restaurant: 'restaurant food',
        hotel: 'hotel building',
        temple: 'temple architecture',
        museum: 'museum architecture',
        park: 'park nature',
        beach: 'beach ocean',
        mountain: 'mountain landscape',
      };
      if (categoryKeywords[place.category]) {
        parts.push(categoryKeywords[place.category]);
      }
    }
    
    return parts.join(' ');
  }

  /**
   * 转换 Unsplash API 响应为标准格式
   */
  private transformPhoto(raw: any): UnsplashPhoto {
    return {
      id: raw.id,
      width: raw.width,
      height: raw.height,
      color: raw.color,
      blurHash: raw.blur_hash || '',
      description: raw.description,
      altDescription: raw.alt_description,
      urls: {
        raw: raw.urls.raw,
        full: raw.urls.full,
        regular: raw.urls.regular,
        small: raw.urls.small,
        thumb: raw.urls.thumb,
      },
      links: {
        html: raw.links.html,
        download: raw.links.download_location,
      },
      user: {
        name: raw.user.name,
        username: raw.user.username,
        link: raw.user.links.html,
      },
      // Unsplash API 要求显示归属信息
      attribution: {
        photographerName: raw.user.name,
        photographerUrl: raw.user.links.html,
        unsplashUrl: raw.links.html,
      },
    };
  }

  /**
   * 构建缓存键
   */
  private buildCacheKey(place: PlaceImageRequest): string {
    const name = place.placeNameEn || place.placeName;
    const country = place.country || '';
    return `unsplash:${name}:${country}`.toLowerCase().replace(/\s+/g, '_');
  }

  /**
   * 从缓存获取
   */
  private getFromCache(key: string): UnsplashPhoto | null {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL_MS) {
      return cached.photo;
    }
    if (cached) {
      this.cache.delete(key); // 过期删除
    }
    return null;
  }

  /**
   * 存入缓存
   */
  private setCache(key: string, photo: UnsplashPhoto): void {
    this.cache.set(key, { photo, timestamp: Date.now() });
    
    // 简单的缓存清理（保持最多 1000 条）
    if (this.cache.size > 1000) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }
  }

  /**
   * 检查速率限制
   */
  private checkRateLimit(): boolean {
    const now = Date.now();
    
    // 每小时重置
    if (now - this.lastResetTime > 60 * 60 * 1000) {
      this.requestCount = 0;
      this.lastResetTime = now;
    }
    
    if (this.requestCount >= this.MAX_REQUESTS_PER_HOUR) {
      return false;
    }
    
    this.requestCount++;
    return true;
  }

  /**
   * 延迟
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 获取缓存统计
   */
  getCacheStats(): { size: number; ttlMs: number } {
    return {
      size: this.cache.size,
      ttlMs: this.CACHE_TTL_MS,
    };
  }

  /**
   * 清除缓存
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.log('缓存已清除');
  }
}
