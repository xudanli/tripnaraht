// src/route-directions/route-directions.module.ts
import { Module } from '@nestjs/common';
import { RouteDirectionsController } from './route-directions.controller';
import { RouteDirectionsService } from './route-directions.service';
import { RouteDirectionSelectorService } from './services/route-direction-selector.service';
import { RouteDirectionPoiGeneratorService } from './services/route-direction-poi-generator.service';
import { RouteDirectionObservabilityService } from './services/route-direction-observability.service';
import { RouteDirectionCacheService } from './services/route-direction-cache.service';
import { RouteDirectionCardService } from './services/route-direction-card.service';
import { RouteDirectionExplainerService } from './services/route-direction-explainer.service';
import { PackKPIAcceptanceService } from './services/pack-kpi-acceptance.service';
import { RouteJudgmentService } from './services/route-judgment.service';
import { EnhancedRiskAssessmentService } from './services/enhanced-risk-assessment.service';
import { ResultPresentationService } from './services/result-presentation.service';
import { CompliancePluginService } from './plugins/compliance-plugin.service';
import { TransportPluginService } from './plugins/transport-plugin.service';
import { forwardRef } from '@nestjs/common';
import { DecisionModule } from '../trips/decision/decision.module';
import { PrismaModule } from '../prisma/prisma.module';
import { POIModule } from '../poi/poi.module';
import { MemoryModule } from '../agent/memory/memory.module';
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
    POIModule,
    forwardRef(() => DecisionModule), // 用于RhythmMatchingService和ThreeLayerExplanationService - 使用 forwardRef 避免循环依赖
    // MemoryModule, // 暂时禁用，测试是否导致阻塞
  ],
  controllers: [RouteDirectionsController],
  providers: [
    // 在 MCP 模式下，提供假的 RedisService
    ...(disableRedis ? [{ provide: RedisService, useClass: MockRedisService }] : []),
    RouteDirectionsService,
    RouteDirectionSelectorService,
    RouteDirectionPoiGeneratorService,
    RouteDirectionObservabilityService,
    RouteDirectionCacheService,
    RouteDirectionCardService,
    CompliancePluginService,
    TransportPluginService,
    RouteDirectionExplainerService,
    PackKPIAcceptanceService,
    RouteJudgmentService,
    EnhancedRiskAssessmentService,
    ResultPresentationService,
  ],
  exports: [
    RouteDirectionsService,
    RouteDirectionSelectorService,
    RouteDirectionPoiGeneratorService,
    RouteDirectionObservabilityService,
    RouteDirectionCacheService,
    RouteDirectionCardService,
    CompliancePluginService,
    TransportPluginService,
    RouteDirectionExplainerService,
    PackKPIAcceptanceService,
    RouteJudgmentService,
    EnhancedRiskAssessmentService,
    ResultPresentationService,
  ],
})
export class RouteDirectionsModule {}

