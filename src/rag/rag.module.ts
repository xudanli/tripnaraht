// src/rag/rag.module.ts
/**
 * RAG 模块
 *
 * 核心功能：
 * - 文档索引和检索（RagService, ChunkRetrievalService）
 * - Hybrid Search（Dense + Sparse）
 * - 重排序（RerankingService）
 * - 查询扩展（QueryExpansionService）
 *
 * Agent 服务：
 * - 合规规则提取（ComplianceFactsAgent）
 * - 路线知识整理（RouteKnowledgeCurator）
 * - 当地洞察（LocalInsightService）
 *
 * 评估与监控：
 * - RAG 评估（RAGEvaluationService）- 支持 Gate 专属评估
 * - RAG 监控（RAGMonitoringService）
 * - 查询收集（RAGQueryCollectorService）
 * - 测试集管理（RagTestsetService）
 *
 * P0 核心服务（决策优先架构）：
 * - 降级策略（RagFallbackService）- 5层降级保证稳定性
 * - Gate 决策日志（GateDecisionLoggerService）- 完整决策追踪
 * - 数据新鲜度（RagFreshnessService）- 自动验证过期数据
 * - MCP 工具调用（McpToolsService）- Web Browse, Google Places 等外部工具
 *
 * 缓存与优化：
 * - Embedding缓存（EmbeddingCacheService）
 */

import { Module, forwardRef } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { PlacesModule } from '../places/places.module';
import { ConfigModule } from '@nestjs/config';
import { KnowledgeBaseModule } from '../knowledge-base/knowledge-base.module';
import { RedisModule } from '../redis/redis.module';
import { RagService } from './services/rag.service';
import { ChunkRetrievalService } from './services/chunk-retrieval.service';
import { ComplianceFactsAgent } from './services/compliance-facts-agent.service';
import { LlmExtractionService } from './services/llm-extraction.service';
import { RouteKnowledgeCurator } from './services/route-knowledge-curator.service';
import { LocalInsightService } from './services/local-insight.service';
import { EnhancedChatService } from './services/enhanced-chat.service';
import { RAGEvaluationService } from './services/rag-evaluation.service';
import { RAGQueryCollectorService } from './services/rag-query-collector.service';
import { EmbeddingCacheService } from './services/embedding-cache.service';
import { RerankingService } from './services/reranking.service';
import { RAGMonitoringService } from './services/rag-monitoring.service';
import { QueryExpansionService } from './services/query-expansion.service';
import { RagTestsetService } from './services/rag-testset.service';
import { RagFallbackService } from './services/rag-fallback.service';
import { GateDecisionLoggerService } from './services/gate-decision-logger.service';
import { RagFreshnessService } from './services/rag-freshness.service';
import { McpToolsService } from './services/mcp-tools.service';
import { RedisCacheService } from './services/redis-cache.service';
import { HybridCacheService } from './services/hybrid-cache.service';
import { RetryHelperService } from './services/retry-helper.service';
import { ParallelExecutorService } from './services/parallel-executor.service';
import { QueryIntentService } from './services/query-intent.service';
import { LlmModule } from '../llm/llm.module';
import { RagController } from './rag.controller';
// RagMetricsController 已删除 - metrics 端点合并到 RagController
import { RagMetricsService } from './services/rag-metrics.service';
import { SkillsModule } from '../skills/skills.module';
import { KPUModule } from '../kpu/kpu.module';

@Module({
  imports: [
    PrismaModule,
    forwardRef(() => PlacesModule), // 使用forwardRef避免循环依赖
    ConfigModule,
    ScheduleModule, // 提供定时任务支持
    KnowledgeBaseModule, // 知识库管理模块
    RedisModule, // Redis缓存支持
    LlmModule, // LLM服务（用于Reranking和QueryExpansion）
    forwardRef(() => SkillsModule), // 使用forwardRef避免循环依赖（SkillsModule -> PlacesModule -> RagModule -> SkillsModule）
    forwardRef(() => KPUModule), // KPU模块（知识处理单元，深度融合）
  ],
  controllers: [RagController],
  providers: [
    RagService,
    ChunkRetrievalService,
    LlmExtractionService,
    ComplianceFactsAgent,
    RouteKnowledgeCurator,
    LocalInsightService,
    EnhancedChatService,
    RAGEvaluationService,
    RAGQueryCollectorService,
    EmbeddingCacheService, // Embedding缓存服务
    RerankingService, // 重排序服务
    RAGMonitoringService, // RAG监控服务
    QueryExpansionService, // 查询扩展服务
    QueryIntentService, // 查询意图分类服务（P1优化）
    RagTestsetService, // 测试集服务（评估数据）
    RagFallbackService, // RAG降级策略服务（P0）
    GateDecisionLoggerService, // Gate决策日志服务（P0）
    RagFreshnessService, // RAG数据新鲜度服务（P0）
    McpToolsService, // MCP工具调用服务（P0）- Web Browse, Google Places等，Skills通过@Optional()注入
    RedisCacheService, // Redis缓存服务（Phase 5.2）
    HybridCacheService, // 混合缓存服务（Redis + Memory，Phase 5.2）
    RetryHelperService, // 错误重试服务（Phase 5.2）- 指数退避
    ParallelExecutorService, // 并行执行服务（Phase 5.2）- 并发控制
    RagMetricsService, // Prometheus监控指标服务（Phase 5.5）
  ],
  exports: [
    RagService,
    ChunkRetrievalService,
    ComplianceFactsAgent,
    RouteKnowledgeCurator,
    LocalInsightService,
    EnhancedChatService,
    RAGEvaluationService,
    RAGQueryCollectorService,
    EmbeddingCacheService, // 导出供PlacesModule使用
    RerankingService, // 导出重排序服务
    RAGMonitoringService, // 导出监控服务
    QueryExpansionService, // 导出查询扩展服务
    QueryIntentService, // 导出查询意图分类服务
    RagTestsetService, // 导出测试集服务
    RagFallbackService, // 导出降级策略服务
    GateDecisionLoggerService, // 导出决策日志服务
    RagFreshnessService, // 导出新鲜度服务
    McpToolsService, // 导出MCP工具服务
    RedisCacheService, // 导出Redis缓存服务
    HybridCacheService, // 导出混合缓存服务
    RetryHelperService, // 导出重试服务
    ParallelExecutorService, // 导出并行执行服务
    RagMetricsService, // 导出监控指标服务
  ],
})
export class RagModule {}

