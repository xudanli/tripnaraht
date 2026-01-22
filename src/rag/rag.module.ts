// src/rag/rag.module.ts
/**
 * RAG 模块
 * 
 * 提供：
 * - 文档索引和检索（RagService）
 * - 合规规则提取（ComplianceFactsAgent）
 * - 路线知识整理（RouteKnowledgeCurator）
 * - 当地洞察（LocalInsightService）
 */

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { PlacesModule } from '../places/places.module';
import { ConfigModule } from '@nestjs/config';
import { RagService } from './services/rag.service';
import { ComplianceFactsAgent } from './services/compliance-facts-agent.service';
import { LlmExtractionService } from './services/llm-extraction.service';
import { RouteKnowledgeCurator } from './services/route-knowledge-curator.service';
import { LocalInsightService } from './services/local-insight.service';
import { EnhancedChatService } from './services/enhanced-chat.service';
import { RAGEvaluationService } from './services/rag-evaluation.service';
import { RAGQueryCollectorService } from './services/rag-query-collector.service';
import { RagController } from './rag.controller';

@Module({
  imports: [
    PrismaModule,
    PlacesModule, // 提供 EmbeddingService
    ConfigModule,
    ScheduleModule, // 提供定时任务支持
  ],
  controllers: [RagController],
  providers: [
    RagService,
    LlmExtractionService,
    ComplianceFactsAgent,
    RouteKnowledgeCurator,
    LocalInsightService,
    EnhancedChatService,
    RAGEvaluationService,
    RAGQueryCollectorService,
  ],
  exports: [
    RagService,
    ComplianceFactsAgent,
    RouteKnowledgeCurator,
    LocalInsightService,
    EnhancedChatService,
    RAGEvaluationService,
    RAGQueryCollectorService,
  ],
})
export class RagModule {}

