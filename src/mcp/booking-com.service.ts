/**
 * Booking.com Service
 * 
 * NestJS 服务层，封装 Booking.com MCP 客户端
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BookingComMcpClient,
  SearchCarRentalsParams,
  SearchCarRentalsResponse,
  SearchCarLocationParams,
  SearchCarLocationResponse,
} from './booking-com-client';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class BookingComService {
  private readonly logger = new Logger(BookingComService.name);
  private client: BookingComMcpClient | null = null;

  constructor(
    @Optional() private readonly redisService?: RedisService,
    @Optional() private readonly configService?: ConfigService,
  ) {
    try {
      // 优先从 ConfigService 读取（NestJS 正确加载的 .env），其次 process.env
      const apiKey = this.configService?.get<string>('RAPIDAPI_BOOKING_COM_API_KEY')
        ?? process.env.RAPIDAPI_BOOKING_COM_API_KEY
        ?? '';
      const apiHost = this.configService?.get<string>('RAPIDAPI_BOOKING_COM_HOST')
        ?? process.env.RAPIDAPI_BOOKING_COM_HOST
        ?? 'booking-com15.p.rapidapi.com';

      if (apiKey && String(apiKey).trim()) {
        this.client = new BookingComMcpClient({ apiKey: String(apiKey).trim(), apiHost: String(apiHost).trim() });
        this.logger.log('✅ Booking.com Service initialized successfully');
      } else {
        this.logger.warn('⚠️  RAPIDAPI_BOOKING_COM_API_KEY is empty, Booking.com features disabled');
        this.client = null;
      }
    } catch (error: any) {
      this.logger.warn(`⚠️  Failed to initialize Booking.com client: ${error.message}`);
      this.logger.warn('💡 Booking.com features will be disabled until API Key is configured');
      this.logger.warn('📝 Please set RAPIDAPI_BOOKING_COM_API_KEY in .env file and restart the server');
      this.client = null;
    }
  }

  /**
   * 搜索租车取还车地点（第一步：获取 Booking.com 认可的坐标）
   */
  async searchCarLocation(params: SearchCarLocationParams): Promise<SearchCarLocationResponse> {
    if (!this.client) {
      throw new Error('Booking.com client is not available. Please check RAPIDAPI_BOOKING_COM_API_KEY configuration.');
    }
    return await this.client.searchCarLocation(params);
  }

  /**
   * 搜索租车
   */
  async searchCarRentals(params: SearchCarRentalsParams): Promise<SearchCarRentalsResponse> {
    if (!this.client) {
      throw new Error('Booking.com client is not available. Please check RAPIDAPI_BOOKING_COM_API_KEY configuration.');
    }

    try {
      return await this.client.searchCarRentals(params);
    } catch (error: any) {
      this.logger.error(`Failed to search car rentals: ${error.message}`);
      throw error;
    }
  }

  /**
   * 检查服务是否可用
   */
  isAvailable(): boolean {
    return this.client !== null;
  }
}
