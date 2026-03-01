/**
 * Decision OS 速率限制中间件
 * 
 * 支持多种限制策略：
 * - 固定窗口
 * - 滑动窗口
 * - 令牌桶
 * - 用户级/IP级/全局限制
 */

import { Injectable, Logger, NestMiddleware, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

// ========== 类型定义 ==========

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (req: Request) => string;
  skipFailedRequests?: boolean;
  skipSuccessfulRequests?: boolean;
  message?: string;
  statusCode?: number;
  headers?: boolean;
}

export interface RateLimitInfo {
  limit: number;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}

export interface RateLimitEntry {
  count: number;
  resetTime: number;
}

export interface TokenBucketConfig {
  capacity: number;
  refillRate: number;
  refillIntervalMs: number;
}

export interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

// ========== 存储接口 ==========

export interface RateLimitStore {
  get(key: string): Promise<RateLimitEntry | undefined>;
  set(key: string, entry: RateLimitEntry): Promise<void>;
  increment(key: string, windowMs: number): Promise<RateLimitEntry>;
  reset(key: string): Promise<void>;
}

// ========== 内存存储实现 ==========

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly store = new Map<string, RateLimitEntry>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(cleanupIntervalMs: number = 60000) {
    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs);
  }

  async get(key: string): Promise<RateLimitEntry | undefined> {
    const entry = this.store.get(key);
    if (entry && Date.now() > entry.resetTime) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  async set(key: string, entry: RateLimitEntry): Promise<void> {
    this.store.set(key, entry);
  }

  async increment(key: string, windowMs: number): Promise<RateLimitEntry> {
    const now = Date.now();
    let entry = await this.get(key);

    if (!entry || now > entry.resetTime) {
      entry = { count: 1, resetTime: now + windowMs };
    } else {
      entry.count++;
    }

    await this.set(key, entry);
    return entry;
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }
}

// ========== 令牌桶实现 ==========

export class TokenBucketLimiter {
  private readonly buckets = new Map<string, TokenBucket>();
  private readonly config: TokenBucketConfig;

  constructor(config: TokenBucketConfig) {
    this.config = config;
  }

  tryConsume(key: string, tokens: number = 1): boolean {
    const bucket = this.getOrCreateBucket(key);
    this.refill(bucket);

    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      return true;
    }

    return false;
  }

  getTokens(key: string): number {
    const bucket = this.buckets.get(key);
    if (!bucket) return this.config.capacity;

    this.refill(bucket);
    return bucket.tokens;
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  private getOrCreateBucket(key: string): TokenBucket {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { tokens: this.config.capacity, lastRefill: Date.now() };
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  private refill(bucket: TokenBucket): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const intervalsElapsed = Math.floor(elapsed / this.config.refillIntervalMs);

    if (intervalsElapsed > 0) {
      bucket.tokens = Math.min(
        this.config.capacity,
        bucket.tokens + intervalsElapsed * this.config.refillRate,
      );
      bucket.lastRefill = now;
    }
  }
}

// ========== 速率限制服务 ==========

@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);
  private readonly store: RateLimitStore;
  private readonly tokenBuckets = new Map<string, TokenBucketLimiter>();

  constructor() {
    this.store = new MemoryRateLimitStore();
  }

  async checkLimit(key: string, config: RateLimitConfig): Promise<RateLimitInfo> {
    const entry = await this.store.increment(key, config.windowMs);
    const remaining = Math.max(0, config.maxRequests - entry.count);
    const resetTime = entry.resetTime;

    const info: RateLimitInfo = {
      limit: config.maxRequests,
      remaining,
      resetTime,
    };

    if (entry.count > config.maxRequests) {
      info.retryAfter = Math.ceil((resetTime - Date.now()) / 1000);
    }

    return info;
  }

  async isAllowed(key: string, config: RateLimitConfig): Promise<boolean> {
    const info = await this.checkLimit(key, config);
    return info.remaining > 0 || info.retryAfter === undefined;
  }

  async reset(key: string): Promise<void> {
    await this.store.reset(key);
  }

  getTokenBucket(name: string, config: TokenBucketConfig): TokenBucketLimiter {
    let bucket = this.tokenBuckets.get(name);
    if (!bucket) {
      bucket = new TokenBucketLimiter(config);
      this.tokenBuckets.set(name, bucket);
    }
    return bucket;
  }
}

// ========== 速率限制中间件 ==========

@Injectable()
export class RateLimiterMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RateLimiterMiddleware.name);
  private readonly service: RateLimiterService;
  private readonly config: RateLimitConfig;

  constructor(config?: Partial<RateLimitConfig>) {
    this.service = new RateLimiterService();
    this.config = {
      windowMs: config?.windowMs ?? 60000,
      maxRequests: config?.maxRequests ?? 100,
      keyGenerator: config?.keyGenerator ?? this.defaultKeyGenerator,
      skipFailedRequests: config?.skipFailedRequests ?? false,
      skipSuccessfulRequests: config?.skipSuccessfulRequests ?? false,
      message: config?.message ?? 'Too many requests, please try again later',
      statusCode: config?.statusCode ?? 429,
      headers: config?.headers ?? true,
    };
  }

  async use(req: Request, res: Response, next: NextFunction): Promise<void> {
    const key = this.config.keyGenerator!(req);
    const info = await this.service.checkLimit(key, this.config);

    if (this.config.headers) {
      res.setHeader('X-RateLimit-Limit', info.limit);
      res.setHeader('X-RateLimit-Remaining', info.remaining);
      res.setHeader('X-RateLimit-Reset', info.resetTime);
    }

    if (info.retryAfter !== undefined) {
      if (this.config.headers) {
        res.setHeader('Retry-After', info.retryAfter);
      }

      this.logger.warn(`Rate limit exceeded for key: ${key}`);

      throw new HttpException(
        {
          statusCode: this.config.statusCode,
          message: this.config.message,
          retryAfter: info.retryAfter,
        },
        this.config.statusCode!,
      );
    }

    next();
  }

  private defaultKeyGenerator(req: Request): string {
    const userId = (req as any).user?.id;
    if (userId) {
      return `user:${userId}`;
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    return `ip:${ip}`;
  }
}

// ========== 预配置限制器 ==========

export const DecisionOSRateLimits = {
  decision: {
    windowMs: 60000,
    maxRequests: 60,
    message: 'Decision rate limit exceeded',
  } as RateLimitConfig,

  feedback: {
    windowMs: 60000,
    maxRequests: 120,
    message: 'Feedback rate limit exceeded',
  } as RateLimitConfig,

  admin: {
    windowMs: 60000,
    maxRequests: 30,
    message: 'Admin API rate limit exceeded',
  } as RateLimitConfig,

  metrics: {
    windowMs: 60000,
    maxRequests: 10,
    message: 'Metrics API rate limit exceeded',
  } as RateLimitConfig,

  training: {
    windowMs: 3600000,
    maxRequests: 10,
    message: 'Training rate limit exceeded (max 10/hour)',
  } as RateLimitConfig,
};

export const DecisionOSTokenBuckets = {
  decision: {
    capacity: 100,
    refillRate: 10,
    refillIntervalMs: 1000,
  } as TokenBucketConfig,

  burst: {
    capacity: 50,
    refillRate: 5,
    refillIntervalMs: 1000,
  } as TokenBucketConfig,
};

// ========== 装饰器 ==========

const rateLimitMetadataKey = Symbol('rateLimit');

export interface RateLimitDecoratorOptions {
  windowMs?: number;
  maxRequests?: number;
  keyPrefix?: string;
}

export function RateLimit(options: RateLimitDecoratorOptions = {}): MethodDecorator {
  return (target: object, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(rateLimitMetadataKey, options, target, propertyKey);
    return descriptor;
  };
}

export function getRateLimitMetadata(target: object, propertyKey: string | symbol): RateLimitDecoratorOptions | undefined {
  return Reflect.getMetadata(rateLimitMetadataKey, target, propertyKey);
}
