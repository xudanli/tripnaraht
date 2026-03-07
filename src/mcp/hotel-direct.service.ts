/**
 * Hotel Direct Service
 * 
 * 直接使用 Google Places API（酒店类别），不依赖 Smithery MCP 服务
 * 支持酒店搜索、详情查询、价格查询、评价查询等功能
 * 支持用户级别的偏好存储和个性化推荐
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';

export interface HotelSearchParams {
  query?: string; // 自然语言查询，如 "纽约市中心酒店"
  location?: { lat: number; lng: number };
  radius?: number; // 米，默认 10000
  type?: string; // 酒店类型，如 "lodging"
  priceLevel?: 1 | 2 | 3 | 4; // 价格等级（1=便宜，4=昂贵）
  minRating?: number; // 最低评分（0-5）
  checkIn?: string; // 入住日期（YYYY-MM-DD）
  checkOut?: string; // 退房日期（YYYY-MM-DD）
  guests?: number; // 入住人数
  language?: string; // 语言代码，默认 'en'
}

export interface HotelDetails {
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
  amenities?: string[]; // 酒店设施
  roomTypes?: string[]; // 房型
}

@Injectable()
export class HotelDirectService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HotelDirectService.name);
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
      // 初始化 HTTP 客户端；LLM_DISABLE_PROXY=true 时直连，避免代理未启动导致 ECONNREFUSED
      const disableProxy =
        process.env.LLM_DISABLE_PROXY === 'true' ||
        process.env.GOOGLE_DISABLE_PROXY === 'true';
      const proxyUrl = disableProxy
        ? undefined
        : process.env.HTTPS_PROXY ||
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
        const testResponse = await this.axiosInstance.get('/textsearch/json', {
          params: {
            query: 'hotel',
            key: this.apiKey,
            type: 'lodging',
          },
        });
        
        if (testResponse.data.status === 'OK' || testResponse.data.status === 'ZERO_RESULTS') {
          this.isAvailable = true;
          this.logger.log('Hotel Direct Service initialized');
        } else {
          this.logger.warn(`Google Places API test returned: ${testResponse.data.status}`);
          this.isAvailable = false;
        }
      } catch (error: any) {
        this.logger.error('Failed to initialize Hotel Direct Service:', error.message);
        this.isAvailable = false;
      }
    } else {
      this.logger.warn('Google Maps/Places API Key not found. Service will not be available.');
      this.isAvailable = false;
    }
  }

  async onModuleDestroy() {
    this.logger.log('Hotel Direct Service destroyed');
  }

  /**
   * 检查服务是否可用
   */
  isServiceAvailable(): boolean {
    return this.isAvailable && !!this.apiKey;
  }

  /**
   * 搜索酒店
   * 支持自然语言查询和多维度过滤
   */
  async searchHotels(params: HotelSearchParams): Promise<{
    success: boolean;
    results: HotelDetails[];
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
        searchParams.query = params.query;
      } else {
        searchParams.query = 'hotel';
      }

      // 添加类型过滤（酒店）
      searchParams.type = params.type || 'lodging';

      // 位置和半径
      if (params.location) {
        searchParams.location = `${params.location.lat},${params.location.lng}`;
        searchParams.radius = params.radius || 10000; // 酒店搜索半径更大
      }

      // 使用 Text Search API
      const response = await this.axiosInstance.get('/textsearch/json', {
        params: searchParams,
      });

      if (response.data.status !== 'OK' && response.data.status !== 'ZERO_RESULTS') {
        throw new Error(`Google Places API error: ${response.data.status} - ${response.data.error_message || 'Unknown error'}`);
      }

      let results = (response.data.results || []).map((place: any) => 
        this.mapPlaceToHotel(place)
      );

      // 应用过滤条件
      if (params.priceLevel) {
        results = results.filter((h: HotelDetails) => 
          h.priceLevel === params.priceLevel
        );
      }

      if (params.minRating) {
        results = results.filter((h: HotelDetails) => 
          h.rating && h.rating >= params.minRating!
        );
      }

      return {
        success: true,
        results,
        totalResults: results.length,
      };
    } catch (error: any) {
      this.logger.error('Failed to search hotels:', error.message);
      throw error;
    }
  }

  /**
   * 获取酒店详情
   */
  async getHotelDetails(placeId: string, language?: string): Promise<HotelDetails | null> {
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
      return this.mapPlaceToHotel(place, true);
    } catch (error: any) {
      this.logger.error('Failed to get hotel details:', error.message);
      throw error;
    }
  }

  /**
   * 附近搜索酒店（使用 Nearby Search API）
   */
  async nearbySearch(params: {
    location: { lat: number; lng: number };
    radius?: number;
    type?: string;
    keyword?: string;
    priceLevel?: 1 | 2 | 3 | 4;
    minRating?: number;
    language?: string;
  }): Promise<HotelDetails[]> {
    if (!this.isServiceAvailable()) {
      throw new Error('Google Places API Key not configured');
    }

    try {
      const searchParams: any = {
        location: `${params.location.lat},${params.location.lng}`,
        radius: params.radius || 10000,
        type: params.type || 'lodging',
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
        this.mapPlaceToHotel(place)
      );

      // 应用过滤条件
      if (params.priceLevel) {
        results = results.filter((h: HotelDetails) => 
          h.priceLevel === params.priceLevel
        );
      }

      if (params.minRating) {
        results = results.filter((h: HotelDetails) => 
          h.rating && h.rating >= params.minRating!
        );
      }

      return results;
    } catch (error: any) {
      this.logger.error('Failed to search nearby hotels:', error.message);
      throw error;
    }
  }

  /**
   * 获取用户酒店偏好
   */
  async getUserPreferences(userId: string): Promise<{
    hotelType: string[];
    priceRange: string;
    amenities: string[];
    favoriteHotels: string[];
  } | null> {
    try {
      const preferences = await this.prisma.hotelPreferences.findUnique({
        where: { userId },
      });

      if (!preferences) {
        return null;
      }

      return {
        hotelType: (preferences.hotelType as string[]) || [],
        priceRange: preferences.priceRange || 'medium',
        amenities: (preferences.amenities as string[]) || [],
        favoriteHotels: (preferences.favoriteHotels as string[]) || [],
      };
    } catch (error: any) {
      this.logger.error('Failed to get user preferences:', error.message);
      throw error;
    }
  }

  /**
   * 保存用户酒店偏好
   */
  async saveUserPreferences(
    userId: string,
    preferences: {
      hotelType?: string[];
      priceRange?: string;
      amenities?: string[];
      favoriteHotels?: string[];
    }
  ): Promise<void> {
    try {
      await this.prisma.hotelPreferences.upsert({
        where: { userId },
        create: {
          userId,
          hotelType: preferences.hotelType || [],
          priceRange: preferences.priceRange || 'medium',
          amenities: preferences.amenities || [],
          favoriteHotels: preferences.favoriteHotels || [],
        },
        update: {
          hotelType: preferences.hotelType,
          priceRange: preferences.priceRange,
          amenities: preferences.amenities,
          favoriteHotels: preferences.favoriteHotels,
          updatedAt: new Date(),
        },
      });
    } catch (error: any) {
      this.logger.error('Failed to save user preferences:', error.message);
      throw error;
    }
  }

  /**
   * 智能推荐酒店（基于用户偏好和上下文）
   */
  async recommendHotels(
    userId: string,
    context: {
      location: { lat: number; lng: number };
      checkIn?: string; // YYYY-MM-DD
      checkOut?: string; // YYYY-MM-DD
      guests?: number;
      radius?: number;
    }
  ): Promise<HotelDetails[]> {
    if (!this.isServiceAvailable()) {
      throw new Error('Google Places API Key not configured');
    }

    try {
      // 获取用户偏好
      const preferences = await this.getUserPreferences(userId);

      // 构建搜索参数
      const searchParams: HotelSearchParams = {
        location: context.location,
        radius: context.radius || 10000,
        language: 'en',
      };

      // 应用用户偏好
      if (preferences) {
        if (preferences.hotelType.length > 0) {
          searchParams.query = `${preferences.hotelType[0]} hotel`;
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

        searchParams.minRating = 4.0; // 默认推荐高评分酒店
      } else {
        searchParams.query = 'hotel';
        searchParams.minRating = 4.0;
      }

      if (context.checkIn) {
        searchParams.checkIn = context.checkIn;
      }
      if (context.checkOut) {
        searchParams.checkOut = context.checkOut;
      }
      if (context.guests) {
        searchParams.guests = context.guests;
      }

      const result = await this.searchHotels(searchParams);
      return result.results.slice(0, 10); // 返回前 10 个推荐
    } catch (error: any) {
      this.logger.error('Failed to recommend hotels:', error.message);
      throw error;
    }
  }

  /**
   * 映射 Google Places API 结果到 HotelDetails
   */
  private mapPlaceToHotel(place: any, includeDetails: boolean = false): HotelDetails {
    const details: HotelDetails = {
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

    // 提取酒店类型和设施信息
    const hotelTypes = place.types?.filter((type: string) => 
      type.includes('lodging') || 
      type.includes('hotel') ||
      type.includes('resort')
    ) || [];
    details.amenities = hotelTypes;

    return details;
  }
}
