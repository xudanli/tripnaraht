// src/places/services/unsplash.service.ts

import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

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
  
  // 内存缓存（生产环境应使用 Redis）
  private cache: Map<string, { photo: UnsplashPhoto; timestamp: number }> = new Map();
  private readonly CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 小时
  
  // 速率限制
  private requestCount = 0;
  private readonly MAX_REQUESTS_PER_HOUR = 50; // Unsplash 免费版限制
  private lastResetTime = Date.now();

  constructor(@Optional() private readonly configService?: ConfigService) {
    this.accessKey = this.configService?.get<string>('UNSPLASH_ACCESS_KEY') || '';
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
      this.logger.error(`获取图片失败 [${place.placeName}]: ${error.message}`);
      return {
        placeId: place.placeId,
        placeName: place.placeName,
        photo: null,
        cached: false,
        error: error.message,
      };
    }
  }

  /**
   * 搜索 Unsplash 图片
   */
  private async searchPhoto(place: PlaceImageRequest): Promise<UnsplashPhoto | null> {
    // 构建搜索查询
    const query = this.buildSearchQuery(place);
    
    const url = new URL(`${this.baseUrl}/search/photos`);
    url.searchParams.set('query', query);
    url.searchParams.set('per_page', '1');          // 只取最佳匹配
    url.searchParams.set('orientation', 'landscape'); // 横向图片更适合展示
    url.searchParams.set('order_by', 'relevant');   // 按相关性排序
    
    this.logger.debug(`[Unsplash] 搜索: ${query}`);
    
    const response = await fetch(url.toString(), {
      headers: {
        'Authorization': `Client-ID ${this.accessKey}`,
        'Accept-Version': 'v1',
      },
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unsplash API Key 无效');
      }
      if (response.status === 403) {
        throw new Error('Unsplash API 速率限制');
      }
      throw new Error(`Unsplash API 错误: ${response.status}`);
    }

    const data = await response.json() as { results?: any[]; total?: number };
    
    if (!data.results || data.results.length === 0) {
      return null;
    }

    const rawPhoto = data.results[0];
    
    // 转换为标准格式
    return this.transformPhoto(rawPhoto);
  }

  /**
   * 构建搜索查询
   */
  private buildSearchQuery(place: PlaceImageRequest): string {
    const parts: string[] = [];
    
    // 优先使用英文名称
    if (place.placeNameEn) {
      parts.push(place.placeNameEn);
    } else {
      parts.push(place.placeName);
    }
    
    // 添加国家（帮助定位）
    if (place.country) {
      parts.push(place.country);
    }
    
    // 根据类别添加关键词
    if (place.category) {
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
