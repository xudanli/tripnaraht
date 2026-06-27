// src/transport/transport.module.ts
import { Module } from '@nestjs/common';
import { TransportController } from './transport.controller';
import { TransportDecisionService } from './transport-decision.service';
import { TransportRoutingService } from './transport-routing.service';
import { GoogleRoutesService } from './services/google-routes.service';
import { AmapRoutesService } from './services/amap-routes.service';
import { LocationDetectorService } from './services/location-detector.service';
import { SmartRoutesService } from './services/smart-routes.service';
import { RouteCacheService } from './services/route-cache.service';
import { TravelTimeEstimatorService } from './services/travel-time-estimator.service';
import { PoiHopTravelSegmentService } from './services/poi-hop-travel-segment.service';
import { SelfHostedRoutingService } from './services/self-hosted-routing.service';
import { PrismaModule } from '../prisma/prisma.module';
import { CacheModule } from '@nestjs/cache-manager';
import { RedisService } from '../redis/redis.service';

// 检查是否在 MCP 模式下
const isMcpMode = process.argv.some(arg => arg.includes('mcp-skills-server')) ||
                  process.env.MCP_MODE === 'true';
const disableRedis = process.env.DISABLE_REDIS === 'true' || isMcpMode;

// 在 MCP 模式下，提供一个假的 RedisService
class MockRedisService {
  async get() { return null; }
  async set() { return Promise.resolve(); }
  async del() { return Promise.resolve(); }
  async exists() { return false; }
  async reset() { return Promise.resolve(); }
  generateKey(prefix: string, ...parts: (string | number)[]): string {
    return `${prefix}:${parts.join(':')}`;
  }
}

@Module({
  imports: [
    PrismaModule,
    // 在 MCP 模式下，使用内存缓存而不是 Redis
    disableRedis 
      ? CacheModule.register({ ttl: 3600, max: 1000 })
      : (() => {
          // 动态导入 RedisModule（仅在非 MCP 模式下）
          const { RedisModule } = require('../redis/redis.module');
          return RedisModule;
        })(),
  ],
  controllers: [TransportController],
  providers: [
    // 在 MCP 模式下，提供假的 RedisService
    ...(disableRedis ? [{ provide: RedisService, useClass: MockRedisService }] : []),
    TransportDecisionService,
    TransportRoutingService,
    GoogleRoutesService,
    AmapRoutesService,
    LocationDetectorService,
    SmartRoutesService,
    SelfHostedRoutingService,
    RouteCacheService,
    TravelTimeEstimatorService,
    PoiHopTravelSegmentService,
  ],
  exports: [
    TransportDecisionService,
    TransportRoutingService,
    SmartRoutesService, // 导出智能路由服务
    GoogleRoutesService,
    SelfHostedRoutingService,
    RouteCacheService, // 导出路线缓存服务
    TravelTimeEstimatorService, // 统一交通时间估算（与 getDayTravelInfo 对齐）
    PoiHopTravelSegmentService,
  ],
})
export class TransportModule {}
