/**
 * Image Direct Service
 * 
 * 直接使用 Pexels API 和 Unsplash API，不依赖 Smithery MCP 服务
 * 支持图片搜索、获取图片详情、获取推荐图片等功能
 * 支持用户级别的图片偏好设置
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

export interface ImageSearchParams {
  query: string; // 搜索关键词
  perPage?: number; // 每页数量（1-80，默认 15）
  page?: number; // 页码（默认 1）
  orientation?: 'landscape' | 'portrait' | 'square'; // 图片方向
  size?: 'large' | 'medium' | 'small'; // 图片尺寸
  color?: string; // 颜色过滤（hex color，如 '#FF0000'）
  locale?: string; // 语言代码（如 'en-US', 'pt-BR', 'es-ES'）
}

export interface ImageDetails {
  id: number;
  width: number;
  height: number;
  url: string;
  photographer: string;
  photographerUrl: string;
  photographerId: number;
  avgColor: string; // 平均颜色（hex）
  src: {
    original: string;
    large2x: string;
    large: string;
    medium: string;
    small: string;
    portrait: string;
    landscape: string;
    tiny: string;
  };
  liked: boolean;
  alt: string; // 图片描述
}

export interface ImageSearchResult {
  page: number;
  perPage: number;
  totalResults: number;
  totalPages: number;
  photos: ImageDetails[];
}

@Injectable()
export class ImageDirectService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ImageDirectService.name);
  private axiosInstance: AxiosInstance;
  private pexelsApiKey: string | null = null;
  private unsplashApiKey: string | null = null;
  private isAvailable: boolean = false;
  private readonly pexelsBaseUrl = 'https://api.pexels.com/v1';
  private readonly unsplashBaseUrl = 'https://api.unsplash.com';

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    // 优先使用 Pexels API（配额更高）
    this.pexelsApiKey = 
      this.configService.get<string>('PEXELS_API_KEY') || 
      process.env.PEXELS_API_KEY ||
      null;
    
    // Unsplash 作为备选
    this.unsplashApiKey = 
      this.configService.get<string>('UNSPLASH_ACCESS_KEY') || 
      this.configService.get<string>('UNSPLASH_API_KEY') ||
      process.env.UNSPLASH_ACCESS_KEY ||
      process.env.UNSPLASH_API_KEY ||
      null;
  }

  async onModuleInit() {
    // 初始化 HTTP 客户端（支持代理）
    const proxyUrl =
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.ALL_PROXY ||
      process.env.all_proxy;
    
    const httpsAgent = proxyUrl
      ? new HttpsProxyAgent<string>(proxyUrl)
      : new https.Agent({
          keepAlive: true,
          family: 4, // 强制 IPv4
          rejectUnauthorized: true,
        });

    this.axiosInstance = axios.create({
      timeout: 30000,
      httpsAgent,
      proxy: false,
      headers: {
        'User-Agent': 'TripNARA/1.0',
      },
    });

    // 测试连接（优先测试 Pexels）
    if (this.pexelsApiKey) {
      try {
        const testResponse = await this.axiosInstance.get(`${this.pexelsBaseUrl}/search`, {
          params: {
            query: 'nature',
            per_page: 1,
          },
          headers: {
            'Authorization': this.pexelsApiKey,
          },
        });
        
        if (testResponse.data && testResponse.data.photos) {
          this.isAvailable = true;
          this.logger.log('Image Direct Service initialized (Pexels API)');
        } else {
          this.logger.warn('Pexels API test returned unexpected format');
          this.isAvailable = false;
        }
      } catch (error: any) {
        this.logger.warn('Failed to initialize with Pexels API:', error.message);
        // 尝试使用 Unsplash
        if (this.unsplashApiKey) {
          try {
            const unsplashTest = await this.axiosInstance.get(`${this.unsplashBaseUrl}/search/photos`, {
              params: {
                query: 'nature',
                per_page: 1,
              },
              headers: {
                'Authorization': `Client-ID ${this.unsplashApiKey}`,
              },
            });
            
            if (unsplashTest.data && unsplashTest.data.results) {
              this.isAvailable = true;
              this.logger.log('Image Direct Service initialized (Unsplash API)');
            }
          } catch (unsplashError: any) {
            this.logger.error('Failed to initialize with Unsplash API:', unsplashError.message);
            this.isAvailable = false;
          }
        } else {
          this.isAvailable = false;
        }
      }
    } else if (this.unsplashApiKey) {
      // 只有 Unsplash API Key
      try {
        const testResponse = await this.axiosInstance.get(`${this.unsplashBaseUrl}/search/photos`, {
          params: {
            query: 'nature',
            per_page: 1,
          },
          headers: {
            'Authorization': `Client-ID ${this.unsplashApiKey}`,
          },
        });
        
        if (testResponse.data && testResponse.data.results) {
          this.isAvailable = true;
          this.logger.log('Image Direct Service initialized (Unsplash API)');
        } else {
          this.logger.warn('Unsplash API test returned unexpected format');
          this.isAvailable = false;
        }
      } catch (error: any) {
        this.logger.error('Failed to initialize Image Direct Service:', error.message);
        this.isAvailable = false;
      }
    } else {
      this.logger.warn('Pexels API Key or Unsplash API Key not found. Service will not be available.');
      this.isAvailable = false;
    }
  }

  async onModuleDestroy() {
    this.logger.log('Image Direct Service destroyed');
  }

  /**
   * 检查服务是否可用
   */
  isServiceAvailable(): boolean {
    return this.isAvailable && (!!this.pexelsApiKey || !!this.unsplashApiKey);
  }

  /**
   * 搜索图片（优先使用 Pexels，失败则使用 Unsplash）
   */
  async searchImages(params: ImageSearchParams): Promise<ImageSearchResult> {
    if (!this.isServiceAvailable()) {
      throw new Error('Pexels API Key or Unsplash API Key not configured');
    }

    // 优先使用 Pexels
    if (this.pexelsApiKey) {
      try {
        return await this.searchWithPexels(params);
      } catch (error: any) {
        this.logger.warn('Pexels API failed, trying Unsplash:', error.message);
        if (this.unsplashApiKey) {
          return await this.searchWithUnsplash(params);
        }
        throw error;
      }
    } else if (this.unsplashApiKey) {
      return await this.searchWithUnsplash(params);
    } else {
      throw new Error('No image API key configured');
    }
  }

  /**
   * 使用 Pexels API 搜索
   */
  private async searchWithPexels(params: ImageSearchParams): Promise<ImageSearchResult> {
    const requestParams: any = {
      query: params.query,
      per_page: params.perPage || 15,
      page: params.page || 1,
    };

    if (params.orientation) {
      requestParams.orientation = params.orientation;
    }
    if (params.size) {
      requestParams.size = params.size;
    }
    if (params.color) {
      requestParams.color = params.color.replace('#', '');
    }
    if (params.locale) {
      requestParams.locale = params.locale;
    }

    const response = await this.axiosInstance.get(`${this.pexelsBaseUrl}/search`, {
      params: requestParams,
      headers: {
        'Authorization': this.pexelsApiKey!,
      },
    });

    if (!response.data || !response.data.photos) {
      throw new Error('Invalid response from Pexels API');
    }

    return {
      page: response.data.page,
      perPage: response.data.per_page,
      totalResults: response.data.total_results,
      totalPages: response.data.total_results ? Math.ceil(response.data.total_results / response.data.per_page) : 0,
      photos: response.data.photos.map((photo: any) => this.mapPexelsPhotoToImageDetails(photo)),
    };
  }

  /**
   * 使用 Unsplash API 搜索
   */
  private async searchWithUnsplash(params: ImageSearchParams): Promise<ImageSearchResult> {
    const requestParams: any = {
      query: params.query,
      per_page: params.perPage || 15,
      page: params.page || 1,
    };

    if (params.orientation) {
      requestParams.orientation = params.orientation;
    }
    if (params.color) {
      requestParams.color = params.color.replace('#', '');
    }

    const response = await this.axiosInstance.get(`${this.unsplashBaseUrl}/search/photos`, {
      params: requestParams,
      headers: {
        'Authorization': `Client-ID ${this.unsplashApiKey!}`,
      },
    });

    if (!response.data || !response.data.results) {
      throw new Error('Invalid response from Unsplash API');
    }

    const totalResults = response.data.total || response.data.results.length;
    const perPage = params.perPage || 15;

    return {
      page: params.page || 1,
      perPage,
      totalResults,
      totalPages: Math.ceil(totalResults / perPage),
      photos: response.data.results.map((photo: any) => this.mapUnsplashPhotoToImageDetails(photo)),
    };
  }

  /**
   * 获取图片详情（根据 ID）
   */
  async getImageDetails(photoId: number, source: 'pexels' | 'unsplash' = 'pexels'): Promise<ImageDetails | null> {
    if (!this.isServiceAvailable()) {
      throw new Error('Pexels API Key or Unsplash API Key not configured');
    }

    try {
      if (source === 'pexels' && this.pexelsApiKey) {
        const response = await this.axiosInstance.get(`${this.pexelsBaseUrl}/photos/${photoId}`, {
          headers: {
            'Authorization': this.pexelsApiKey,
          },
        });

        if (response.data) {
          return this.mapPexelsPhotoToImageDetails(response.data);
        }
      } else if (source === 'unsplash' && this.unsplashApiKey) {
        const response = await this.axiosInstance.get(`${this.unsplashBaseUrl}/photos/${photoId}`, {
          headers: {
            'Authorization': `Client-ID ${this.unsplashApiKey}`,
          },
        });

        if (response.data) {
          return this.mapUnsplashPhotoToImageDetails(response.data);
        }
      }
    } catch (error: any) {
      this.logger.error('Failed to get image details:', error.message);
      return null;
    }

    return null;
  }

  /**
   * 获取推荐图片（基于关键词）
   */
  async getCuratedPhotos(params: { perPage?: number; page?: number } = {}): Promise<ImageSearchResult> {
    if (!this.isServiceAvailable()) {
      throw new Error('Pexels API Key or Unsplash API Key not configured');
    }

    // Pexels 有专门的 curated 端点
    if (this.pexelsApiKey) {
      try {
        const response = await this.axiosInstance.get(`${this.pexelsBaseUrl}/curated`, {
          params: {
            per_page: params.perPage || 15,
            page: params.page || 1,
          },
          headers: {
            'Authorization': this.pexelsApiKey,
          },
        });

        if (response.data && response.data.photos) {
          return {
            page: response.data.page,
            perPage: response.data.per_page,
            totalResults: response.data.photos.length,
            totalPages: 1,
            photos: response.data.photos.map((photo: any) => this.mapPexelsPhotoToImageDetails(photo)),
          };
        }
      } catch (error: any) {
        this.logger.warn('Failed to get curated photos from Pexels:', error.message);
      }
    }

    // Unsplash 使用搜索替代
    if (this.unsplashApiKey) {
      return await this.searchWithUnsplash({
        query: 'travel',
        perPage: params.perPage || 15,
        page: params.page || 1,
      });
    }

    throw new Error('No image API available');
  }

  /**
   * 获取用户图片偏好设置
   */
  async getUserImagePreferences(userId: string): Promise<{
    preferredStyles: string[];
    preferredColors: string[];
    preferredOrientations: string[];
    favoriteImages: number[];
  } | null> {
    try {
      const preferences = await this.prisma.imagePreferences.findUnique({
        where: { userId },
      });

      if (!preferences) {
        return null;
      }

      return {
        preferredStyles: (preferences.preferredStyles as string[]) || [],
        preferredColors: (preferences.preferredColors as string[]) || [],
        preferredOrientations: (preferences.preferredOrientations as string[]) || [],
        favoriteImages: (preferences.favoriteImages as number[]) || [],
      };
    } catch (error: any) {
      this.logger.error('Failed to get user image preferences:', error.message);
      throw error;
    }
  }

  /**
   * 保存用户图片偏好设置
   */
  async saveUserImagePreferences(
    userId: string,
    preferences: {
      preferredStyles?: string[];
      preferredColors?: string[];
      preferredOrientations?: string[];
      favoriteImages?: number[];
    }
  ): Promise<void> {
    try {
      await this.prisma.imagePreferences.upsert({
        where: { userId },
        create: {
          userId,
          preferredStyles: preferences.preferredStyles || [],
          preferredColors: preferences.preferredColors || [],
          preferredOrientations: preferences.preferredOrientations || [],
          favoriteImages: preferences.favoriteImages || [],
        },
        update: {
          preferredStyles: preferences.preferredStyles,
          preferredColors: preferences.preferredColors,
          preferredOrientations: preferences.preferredOrientations,
          favoriteImages: preferences.favoriteImages,
          updatedAt: new Date(),
        },
      });
    } catch (error: any) {
      this.logger.error('Failed to save user image preferences:', error.message);
      throw error;
    }
  }

  /**
   * 智能推荐图片（基于用户偏好）
   */
  async recommendImages(
    userId: string,
    context: {
      query?: string;
      perPage?: number;
      page?: number;
    }
  ): Promise<ImageSearchResult> {
    if (!this.isServiceAvailable()) {
      throw new Error('Pexels API Key or Unsplash API Key not configured');
    }

    try {
      // 获取用户偏好
      const userPrefs = await this.getUserImagePreferences(userId);
      
      // 构建搜索参数
      const searchParams: ImageSearchParams = {
        query: context.query || 'travel',
        perPage: context.perPage || 15,
        page: context.page || 1,
      };

      // 应用用户偏好
      if (userPrefs) {
        if (userPrefs.preferredOrientations.length > 0) {
          searchParams.orientation = userPrefs.preferredOrientations[0] as any;
        }
        if (userPrefs.preferredColors.length > 0) {
          searchParams.color = userPrefs.preferredColors[0];
        }
      }

      // 搜索图片
      const result = await this.searchImages(searchParams);

      // 如果用户有收藏的图片，可以在这里进行排序优化
      // （简化实现，直接返回搜索结果）

      return result;
    } catch (error: any) {
      this.logger.error('Failed to recommend images:', error.message);
      throw error;
    }
  }

  /**
   * 将 Pexels 照片映射为统一格式
   */
  private mapPexelsPhotoToImageDetails(photo: any): ImageDetails {
    return {
      id: photo.id,
      width: photo.width,
      height: photo.height,
      url: photo.url,
      photographer: photo.photographer,
      photographerUrl: photo.photographer_url,
      photographerId: photo.photographer_id,
      avgColor: photo.avg_color || '#000000',
      src: {
        original: photo.src.original,
        large2x: photo.src.large2x,
        large: photo.src.large,
        medium: photo.src.medium,
        small: photo.src.small,
        portrait: photo.src.portrait,
        landscape: photo.src.landscape,
        tiny: photo.src.tiny,
      },
      liked: photo.liked || false,
      alt: photo.alt || '',
    };
  }

  /**
   * 将 Unsplash 照片映射为统一格式
   */
  private mapUnsplashPhotoToImageDetails(photo: any): ImageDetails {
    return {
      id: photo.id,
      width: photo.width,
      height: photo.height,
      url: photo.links?.html || photo.url || '',
      photographer: photo.user?.name || 'Unknown',
      photographerUrl: photo.user?.links?.html || '',
      photographerId: photo.user?.id || 0,
      avgColor: photo.color || '#000000',
      src: {
        original: photo.urls?.full || photo.urls?.raw || '',
        large2x: photo.urls?.full || '',
        large: photo.urls?.regular || '',
        medium: photo.urls?.small || '',
        small: photo.urls?.thumb || '',
        portrait: photo.urls?.regular || '',
        landscape: photo.urls?.regular || '',
        tiny: photo.urls?.thumb || '',
      },
      liked: photo.liked_by_user || false,
      alt: photo.description || photo.alt_description || '',
    };
  }
}
