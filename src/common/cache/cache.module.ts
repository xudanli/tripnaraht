// src/common/cache/cache.module.ts

import { Module, Global } from '@nestjs/common';
import { CacheService } from './cache.service';
import { RedisModule } from '../../redis/redis.module';

/**
 * 通用缓存模块
 * 
 * 提供统一的缓存服务，支持Redis和内存缓存降级
 */
@Global()
@Module({
  imports: [RedisModule],
  providers: [CacheService],
  exports: [CacheService],
})
export class CacheModule {}
