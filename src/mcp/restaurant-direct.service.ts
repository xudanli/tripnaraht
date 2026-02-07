/**
 * Restaurant Direct Service
 * 
 * 直接使用 Google Places API（餐饮类别），不依赖 Smithery MCP 服务
 * 支持餐厅搜索、详情查询、菜单获取、评价查询等功能
 * 支持用户级别的偏好存储和个性化推荐
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

export interface RestaurantSearchParams {
  query?: string; // 自然语言查询，如 "附近好吃的意大利餐厅"
  location?: { lat: number; lng: number };
  radius?: number; // 米，默认 5000
  type?: string; // 餐厅类型，如 "restaurant", "cafe", "bar"
  priceLevel?: 1 | 2 | 3 | 4; // 价格等级（1=便宜，4=昂贵）
  minRating?: number; // 最低评分（0-5）
  openNow?: boolean; // 是否现在营业
  language?: string; // 语言代码，默认 'en'
}

export interface RestaurantDetails {
  placeId: string;
  name: string;
  address: string;
  location: { lat: number; lng: number };
  rating?: number;
  userRatingsTotal?: number;
  priceLevel?: number;
  types?: string[];
  openingHours?: {
    openNow: boolean;
    weekdayText?: string[];
  };
  photos?: Array<{
    photoReference: string;
    width: number;
    height: number;
  }>;
  phoneNumber?: string;
  website?: string;
  reviews?: Array<{
    authorName: string;
    rating: number;
    text: string;
    time: number;
  }>;
  cuisine?: string[];
  dietaryRestrictions?: string[];
}

@Injectable()
export class RestaurantDirectService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RestaurantDirectService.name);
  private axiosInstance: AxiosInstance;
  private apiKey: string | null = null;
  private isAvailable: boolean = false;
  private readonly baseUrl = 'https://maps.googleapis.com/maps/api/place';

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.apiKey = 
      this.configService.get<string>('GOOGLE_MAPS_API_KEY') || 
      this.configService.get<string>('GOOGLE_PLACES_API_KEY') ||
      process.env.GOOGLE_MAPS_API_KEY || 
      process.env.GOOGLE_PLACES_API_KEY ||
      null;
  }

  async onModuleInit() {
    if (this.apiKey) {
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
        baseURL: this.baseUrl,
        timeout: 30000,
        httpsAgent,
        proxy: false,
        headers: {
          'User-Agent': 'TripNARA/1.0',
        },
      });

      // 测试连接
      try {
        // 简单的测试查询
        const testResponse = await this.axiosInstance.get('/textsearch/json', {
          params: {
            query: 'restaurant',
            key: this.apiKey,
            type: 'restaurant',
          },
        });
        
        if (testResponse.data.status === 'OK' || testResponse.data.status === 'ZERO_RESULTS') {
          this.isAvailable = true;
          this.logger.log('Restaurant Direct Service initialized');
        } else {
          this.logger.warn(`Google Places API test returned: ${testResponse.data.status}`);
          this.isAvailable = false;
        }
      } catch (error: any) {
        this.logger.error('Failed to initialize Restaurant Direct Service:', error.message);
        this.isAvailable = false;
      }
    } else {
      this.logger.warn('Google Maps/Places API Key not found. Service will not be available.');
      this.isAvailable = false;
    }
  }

  async onModuleDestroy() {
    this.logger.log('Restaurant Direct Service destroyed');
  }

  /**
   * 检查服务是否可用
   */
  isServiceAvailable(): boolean {
    return this.isAvailable && !!this.apiKey;
  }

  /**
   * 搜索餐厅
   * 支持自然语言查询和多维度过滤
   */
  async searchRestaurants(params: RestaurantSearchParams): Promise<{
    success: boolean;
    results: RestaurantDetails[];
    totalResults?: number;
  }> {
    if (!this.isServiceAvailable()) {
      throw new Error('Google Places API Key not configured');
    }

    try {
      const searchParams: any = {
        key: this.apiKey!,
        language: params.language || 'en',
      };

      // 构建查询字符串
      if (params.query) {
        // 自然语言查询
        searchParams.query = params.query;
      } else {
        // 如果没有查询，使用位置搜索
        searchParams.query = 'restaurant';
      }

      // 添加类型过滤（餐饮相关）
      if (params.type) {
        searchParams.type = params.type;
      } else {
        // 默认搜索餐厅
        searchParams.type = 'restaurant';
      }

      // 位置和半径
      if (params.location) {
        searchParams.location = `${params.location.lat},${params.location.lng}`;
        searchParams.radius = params.radius || 5000;
      }

      // 使用 Text Search API
      const response = await this.axiosInstance.get('/textsearch/json', {
        params: searchParams,
      });

      if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
        throw new Error(`Google Places API error: ${response.data.status} - ${response.data.error_message || 'Unknown error'}`);
      }

      let results = (response.data.results || []).map((place: any) => 
        this.mapPlaceToRestaurant(place)
      );

      // 应用过滤条件
      if (params.priceLevel) {
        results = results.filter((r: RestaurantDetails) => 
          r.priceLevel === params.priceLevel
        );
      }

      if (params.minRating) {
        results = results.filter((r: RestaurantDetails) => 
          r.rating && r.rating >= params.minRating!
        );
      }

      if (params.openNow !== undefined) {
        results = results.filter((r: RestaurantDetails) => 
          r.openingHours?.openNow === params.openNow
        );
      }

      return {
        success: true,
        results,
        totalResults: results.length,
      };
    } catch (error: any) {
      this.logger.error('Failed to search restaurants:', error.message);
      throw error;
    }
  }

  /**
   * 获取餐厅详情
   */
  async getRestaurantDetails(placeId: string, language?: string): Promise<RestaurantDetails | null> {
    if (!this.isServiceAvailable()) {
      throw new Error('Google Places API Key not configured');
    }

    try {
      const response = await this.axiosInstance.get('/details/json', {
        params: {
          place_id: placeId,
          key: this.apiKey!,
          language: language || 'en',
          fields: [
            'place_id',
            'name',
            'formatted_address',
            'geometry',
            'rating',
            'user_ratings_total',
            'price_level',
            'types',
            'opening_hours',
            'photos',
            'formatted_phone_number',
            'website',
            'reviews',
            'international_phone_number',
          ].join(','),
        },
      });

      if (response.data.status !== 'OK') {
        throw new Error(`Google Places API error: ${response.data.status} - ${response.data.error_message || 'Unknown error'}`);
      }

      const place = response.data.result;
      return this.mapPlaceToRestaurant(place, true);
    } catch (error: any) {
      this.logger.error('Failed to get restaurant details:', error.message);
      throw error;
    }
  }

  /**
   * 附近搜索餐厅（使用 Nearby Search API）
   */
  async nearbySearch(params: {
    location: { lat: number; lng: number };
    radius?: number;
    type?: string;
    keyword?: string;
    priceLevel?: 1 | 2 | 3 | 4;
    minRating?: number;
    openNow?: boolean;
    language?: string;
  }): Promise<RestaurantDetails[]> {
    if (!this.isServiceAvailable()) {
      throw new Error('Google Places API Key not configured');
    }

    try {
      const searchParams: any = {
        location: `${params.location.lat},${params.location.lng}`,
        radius: params.radius || 5000,
        type: params.type || 'restaurant',
        key: this.apiKey!,
        language: params.language || 'en',
      };

      if (params.keyword) {
        searchParams.keyword = params.keyword;
      }

      const response = await this.axiosInstance.get('/nearbysearch/json', {
        params: searchParams,
      });

      if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
        throw new Error(`Google Places API error: ${response.data.status} - ${response.data.error_message || 'Unknown error'}`);
      }

      let results = (response.data.results || []).map((place: any) => 
        this.mapPlaceToRestaurant(place)
      );

      // 应用过滤条件
      if (params.priceLevel) {
        results = results.filter((r: RestaurantDetails) => 
          r.priceLevel === params.priceLevel
        );
      }

      if (params.minRating) {
        results = results.filter((r: RestaurantDetails) => 
          r.rating && r.rating >= params.minRating!
        );
      }

      if (params.openNow !== undefined) {
        results = results.filter((r: RestaurantDetails) => 
          r.openingHours?.openNow === params.openNow
        );
      }

      return results;
    } catch (error: any) {
      this.logger.error('Failed to search nearby restaurants:', error.message);
      throw error;
    }
  }

  /**
   * 获取用户餐厅偏好
   */
  async getUserPreferences(userId: string): Promise<{
    cuisine: string[];
    priceRange: string;
    dietaryRestrictions: string[];
    favoriteRestaurants: string[];
  } | null> {
    try {
      const preferences = await this.prisma.restaurantPreferences.findUnique({
        where: { userId },
      });

      if (!preferences) {
        return null;
      }

      return {
        cuisine: (preferences.cuisine as string[]) || [],
        priceRange: preferences.priceRange || 'medium',
        dietaryRestrictions: (preferences.dietaryRestrictions as string[]) || [],
        favoriteRestaurants: (preferences.favoriteRestaurants as string[]) || [],
      };
    } catch (error: any) {
      this.logger.error('Failed to get user preferences:', error.message);
      throw error;
    }
  }

  /**
   * 保存用户餐厅偏好
   */
  async saveUserPreferences(
    userId: string,
    preferences: {
      cuisine?: string[];
      priceRange?: string;
      dietaryRestrictions?: string[];
      favoriteRestaurants?: string[];
    }
  ): Promise<void> {
    try {
      await this.prisma.restaurantPreferences.upsert({
        where: { userId },
        create: {
          userId,
          cuisine: preferences.cuisine || [],
          priceRange: preferences.priceRange || 'medium',
          dietaryRestrictions: preferences.dietaryRestrictions || [],
          favoriteRestaurants: preferences.favoriteRestaurants || [],
        },
        update: {
          cuisine: preferences.cuisine,
          priceRange: preferences.priceRange,
          dietaryRestrictions: preferences.dietaryRestrictions,
          favoriteRestaurants: preferences.favoriteRestaurants,
          updatedAt: new Date(),
        },
      });
    } catch (error: any) {
      this.logger.error('Failed to save user preferences:', error.message);
      throw error;
    }
  }

  /**
   * 智能推荐餐厅（基于用户偏好和上下文）
   */
  async recommendRestaurants(
    userId: string,
    context: {
      location: { lat: number; lng: number };
      time?: Date;
      budget?: number;
      radius?: number;
    }
  ): Promise<RestaurantDetails[]> {
    if (!this.isServiceAvailable()) {
      throw new Error('Google Places API Key not configured');
    }

    try {
      // 获取用户偏好
      const preferences = await this.getUserPreferences(userId);

      // 构建搜索参数
      const searchParams: RestaurantSearchParams = {
        location: context.location,
        radius: context.radius || 5000,
        language: 'en',
      };

      // 应用用户偏好
      if (preferences) {
        if (preferences.cuisine.length > 0) {
          // 使用第一个菜系作为关键词
          searchParams.query = `${preferences.cuisine[0]} restaurant`;
        }

        if (preferences.priceRange) {
          const priceMap: Record<string, 1 | 2 | 3 | 4> = {
            'low': 1,
            'medium': 2,
            'high': 3,
            'very_high': 4,
          };
          searchParams.priceLevel = priceMap[preferences.priceRange] || 2;
        }

        searchParams.minRating = 4.0; // 默认推荐高评分餐厅
      } else {
        searchParams.query = 'restaurant';
        searchParams.minRating = 4.0;
      }

      // 检查是否现在营业
      if (context.time) {
        const now = new Date();
        const hours = now.getHours();
        // 假设营业时间（可以根据实际情况调整）
        if (hours >= 8 && hours < 22) {
          searchParams.openNow = true;
        }
      }

      const result = await this.searchRestaurants(searchParams);
      return result.results.slice(0, 10); // 返回前 10 个推荐
    } catch (error: any) {
      this.logger.error('Failed to recommend restaurants:', error.message);
      throw error;
    }
  }

  /**
   * 映射 Google Places API 结果到 RestaurantDetails
   */
  private mapPlaceToRestaurant(place: any, includeDetails: boolean = false): RestaurantDetails {
    const details: RestaurantDetails = {
      placeId: place.place_id,
      name: place.name,
      address: place.formatted_address || place.vicinity || '',
      location: {
        lat: place.geometry?.location?.lat || 0,
        lng: place.geometry?.location?.lng || 0,
      },
      rating: place.rating,
      userRatingsTotal: place.user_ratings_total,
      priceLevel: place.price_level,
      types: place.types || [],
    };

    if (includeDetails) {
      details.phoneNumber = place.formatted_phone_number || place.international_phone_number;
      details.website = place.website;
      details.openingHours = place.opening_hours ? {
        openNow: place.opening_hours.open_now,
        weekdayText: place.opening_hours.weekday_text,
      } : undefined;
      details.photos = place.photos?.map((photo: any) => ({
        photoReference: photo.photo_reference,
        width: photo.width,
        height: photo.height,
      }));
      details.reviews = place.reviews?.map((review: any) => ({
        authorName: review.author_name,
        rating: review.rating,
        text: review.text,
        time: review.time,
      }));
    }

    // 提取菜系信息
    const cuisineTypes = place.types?.filter((type: string) => 
      type.includes('restaurant') || 
      type.includes('food') ||
      type.includes('meal')
    ) || [];
    details.cuisine = cuisineTypes;

    return details;
  }
}
