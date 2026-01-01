// src/contact/services/rate-limit.service.ts
import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service';

export interface RateLimitOptions {
  userId?: string;
  ipAddress?: string;
  maxRequests: number;
  windowMs: number;
}

@Injectable()
export class RateLimitService {
  private readonly logger = new Logger(RateLimitService.name);
  
  // 匿名用户限流配置：每小时 3 次
  private readonly anonymousLimit = 3;
  private readonly anonymousWindowMs = 60 * 60 * 1000; // 1 小时

  // 已认证用户限流配置：每小时 10 次
  private readonly authenticatedLimit = 10;
  private readonly authenticatedWindowMs = 60 * 60 * 1000; // 1 小时

  constructor(
    private redisService: RedisService,
    private configService: ConfigService,
  ) {}

  /**
   * 检查是否超过限流
   * @param userId 用户ID（可选）
   * @param ipAddress IP地址（可选）
   * @returns 是否超过限流
   * @throws HttpException 如果超过限流
   */
  async checkRateLimit(userId?: string, ipAddress?: string): Promise<void> {
    const isAuthenticated = !!userId;
    const limit = isAuthenticated ? this.authenticatedLimit : this.anonymousLimit;
    const windowMs = isAuthenticated ? this.authenticatedWindowMs : this.anonymousWindowMs;

    // 使用用户ID或IP地址作为限流键
    const key = userId 
      ? this.redisService.generateKey('contact:rate_limit:user', userId)
      : this.redisService.generateKey('contact:rate_limit:ip', ipAddress || 'unknown');

    // 获取当前计数
    const currentCount = await this.redisService.get<number>(key) || 0;

    if (currentCount >= limit) {
      const resetTime = new Date(Date.now() + windowMs);
      throw new HttpException(
        {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: '发送消息过于频繁，请稍后再试',
            details: {
              resetTime: resetTime.toISOString(),
            },
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 增加计数
    const newCount = currentCount + 1;
    await this.redisService.set(key, newCount, Math.floor(windowMs / 1000));

    this.logger.debug(`限流检查通过: key=${key}, count=${newCount}/${limit}`);
  }

  /**
   * 获取限流信息（用于前端显示）
   */
  async getRateLimitInfo(userId?: string, ipAddress?: string): Promise<{
    limit: number;
    remaining: number;
    resetTime: Date;
  }> {
    const isAuthenticated = !!userId;
    const limit = isAuthenticated ? this.authenticatedLimit : this.anonymousLimit;
    const windowMs = isAuthenticated ? this.authenticatedWindowMs : this.anonymousWindowMs;

    const key = userId 
      ? this.redisService.generateKey('contact:rate_limit:user', userId)
      : this.redisService.generateKey('contact:rate_limit:ip', ipAddress || 'unknown');

    const currentCount = await this.redisService.get<number>(key) || 0;
    const remaining = Math.max(0, limit - currentCount);
    const resetTime = new Date(Date.now() + windowMs);

    return {
      limit,
      remaining,
      resetTime,
    };
  }
}
