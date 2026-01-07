// src/redis/redis.module.ts
import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';
import { Logger } from '@nestjs/common';

// 检查是否在 MCP 模式下（在模块加载时检查，避免导入 redisStore）
const isMcpMode = process.argv.some(arg => arg.includes('mcp-skills-server')) ||
                  process.env.MCP_MODE === 'true';
const disableRedis = process.env.DISABLE_REDIS === 'true' || isMcpMode;

// 仅在非 MCP 模式下动态导入 redisStore
let redisStore: any = null;
if (!disableRedis) {
  try {
    redisStore = require('cache-manager-redis-store');
  } catch (error) {
    // redisStore 不可用时，使用内存缓存
  }
}

@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const logger = new Logger('RedisModule');
        
        // 再次检查（运行时检查）
        const runtimeDisableRedis = configService.get<string>('DISABLE_REDIS') === 'true' ||
                                     process.env.DISABLE_REDIS === 'true' ||
                                     isMcpMode ||
                                     !redisStore;
        
        if (runtimeDisableRedis) {
          logger.warn('Redis disabled, using in-memory cache (MCP/test mode)');
          // 使用内存缓存
          return {
            ttl: configService.get<number>('REDIS_TTL', 3600), // 默认 1 小时
            max: 1000, // 最大缓存条目数
          };
        }
        
        const redisHost = configService.get<string>('REDIS_HOST', 'localhost');
        const redisPort = configService.get<number>('REDIS_PORT', 6379);
        const redisPassword = configService.get<string>('REDIS_PASSWORD');
        const redisDb = configService.get<number>('REDIS_DB', 0);
        const ttl = configService.get<number>('REDIS_TTL', 3600); // 默认 1 小时

        return {
          store: redisStore.redisStore || redisStore,
          host: redisHost,
          port: redisPort,
          password: redisPassword,
          db: redisDb,
          ttl: ttl, // 默认 TTL（秒）
          max: 1000, // 最大缓存条目数
        };
      },
    }),
  ],
  providers: [RedisService],
  exports: [CacheModule, RedisService],
})
export class RedisModule {}
