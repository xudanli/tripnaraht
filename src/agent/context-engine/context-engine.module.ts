// src/agent/context-engine/context-engine.module.ts
/**
 * Context Engine Module
 * 
 * TripNARA Context Engineer 模块
 */

import { Module, Global, forwardRef } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { ContextEngineerService } from './services/context-engineer.service';
import { ContextBuilderService } from './services/context-builder.service';
import { ContextRankerService } from './services/context-ranker.service';
import { ContextCompressorService } from './services/context-compressor.service';
import { ContextBudgetManagerService } from './services/context-budget-manager.service';
import { ContextCacheService } from './services/context-cache.service';
import { DynamicContextSelectorService } from './services/dynamic-context-selector.service';
import { TripTaskMemoryService } from './services/trip-task-memory.service';
import { ExecutionHistoryCompressorService } from './services/execution-history-compressor.service';
import { IncrementalItineraryGeneratorService } from './services/incremental-itinerary-generator.service';
import { ContextMetricsService } from './services/context-metrics.service';
import { ContextLearningService } from './services/context-learning.service';
import { ContextPrometheusMetricsService } from './services/context-prometheus-metrics.service';
import { UserProfileService } from './services/user-profile.service';
import { CompressionLearningService } from './services/compression-learning.service';
import { ContextPerformanceAnalysisService } from './services/context-performance-analysis.service';
import { ContextController } from './context.controller';
import { SkillsModule } from '../../skills/skills.module';
import { RedisModule } from '../../redis/redis.module';
import { SharedMemoryModule } from '../../agent/memory/shared-memory.module';
import { RagModule } from '../../rag/rag.module'; // Phase 2.1 优化: 导入 RAG 模块以使用 ParallelExecutorService

@Global()
@Module({
  imports: [
    PrismaModule,
    forwardRef(() => SkillsModule), // 使用 forwardRef 避免循环依赖
    RedisModule, // 提供 RedisService（用于持久化缓存）
    forwardRef(() => RagModule), // Phase 2.1 优化: 导入 RAG 模块以使用 ParallelExecutorService
    forwardRef(() => SharedMemoryModule), // Context Orchestrator: 读取 UserTravelProfile（全局 SharedMemory）
  ],
  controllers: [ContextController],
  providers: [
    ContextEngineerService,
    ContextBuilderService, // Phase 1: Context Engine 工业化
    ContextRankerService, // Phase 2: Context Engine 工业化
    ContextCompressorService, // Phase 3: Context Engine 工业化
    ContextBudgetManagerService, // Phase 4: Context Engine 工业化
    ContextCacheService, // Phase 5: Context Engine 工业化
    DynamicContextSelectorService,
    TripTaskMemoryService,
    ExecutionHistoryCompressorService,
    IncrementalItineraryGeneratorService, // 分段规划 POC: Day1→Day2→Day3
    ContextMetricsService,
    ContextLearningService,
    ContextPrometheusMetricsService, // Phase 1.4 优化: Prometheus 指标收集
    UserProfileService, // Phase 3.1 优化: 用户画像学习
    CompressionLearningService, // Phase 3.3 优化: 压缩策略学习
    ContextPerformanceAnalysisService, // Phase 4.3 优化: 性能分析报告
    { provide: 'ContextEngineerService', useExisting: ContextEngineerService },
  ],
  exports: [
    TripTaskMemoryService,
    ContextEngineerService,
    ContextBuilderService,
    ContextRankerService,
    ContextCompressorService,
    ContextBudgetManagerService,
    ContextCacheService,
    IncrementalItineraryGeneratorService,
    ContextMetricsService,
    ContextLearningService,
    ContextPrometheusMetricsService, // Phase 1.4 优化: 导出 Prometheus 指标服务
    UserProfileService, // Phase 3.1 优化: 导出用户画像服务
    CompressionLearningService, // Phase 3.3 优化: 导出压缩策略学习服务
    ContextPerformanceAnalysisService, // Phase 4.3 优化: 导出性能分析服务
    'ContextEngineerService',
  ],
})
export class ContextEngineModule {}