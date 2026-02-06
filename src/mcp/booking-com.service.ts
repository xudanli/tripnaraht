/**
 * Booking.com Service
 * 
 * NestJS 服务层，封装 Booking.com MCP 客户端
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { BookingComMcpClient, SearchCarRentalsParams, SearchCarRentalsResponse } from './booking-com-client';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class BookingComService {
  private readonly logger = new Logger(BookingComService.name);
  private client: BookingComMcpClient | null = null;

  constructor(@Optional() private readonly redisService?: RedisService) {
    try {
      this.client = new BookingComMcpClient();
      this.logger.log('✅ Booking.com Service initialized successfully');
    } catch (error: any) {
      this.logger.warn(`⚠️  Failed to initialize Booking.com client: ${error.message}`);
      this.logger.warn('💡 Booking.com features will be disabled until API Key is configured');
      this.logger.warn('📝 Please set RAPIDAPI_BOOKING_COM_API_KEY in .env file and restart the server');
      this.client = null;
    }
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
