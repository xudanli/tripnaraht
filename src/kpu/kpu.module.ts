// src/kpu/kpu.module.ts
/**
 * KPU (Knowledge Processing Unit) 模块
 * 
 * 核心功能：
 * - 知识检索与验证（IntegratedRAGKPUService）
 * - 知识片段验证（KnowledgeValidationService）
 * - 验证评分（ValidationScoringService）
 * 
 * 与RAG系统深度融合：
 * - 检索阶段验证：实时验证检索到的知识片段
 * - 生成阶段验证：验证AI生成内容，失败时自动调整
 */

import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { RagModule } from '../rag/rag.module';
import { LlmModule } from '../llm/llm.module';
import { RedisModule } from '../redis/redis.module';
import { IntegratedRAGKPUService } from './services/integrated-rag-kpu.service';
import { KnowledgeValidationService } from './services/knowledge-validation.service';
import { ValidationScoringService } from './services/validation-scoring.service';
import { ValidationCacheService } from './services/validation-cache.service';
import { KPUMonitoringService } from './services/kpu-monitoring.service';
import { KPUConfigService } from './services/kpu-config.service';
import { KPUHealthService } from './services/kpu-health.service';
import kpuConfig from './config/kpu.config';

/**
 * ⚠️ 控制器已删除（2026-02-03）
 * KPU 是 RAG 系统的内部组件，前端应通过 /rag 接口访问知识检索能力。
 */
@Module({
  imports: [
    ConfigModule.forFeature(kpuConfig), // KPU配置
    PrismaModule,
    forwardRef(() => RagModule), // 使用forwardRef避免循环依赖
    LlmModule, // LLM服务（用于事实检查和生成）
    RedisModule, // Redis缓存（用于验证结果缓存）
  ],
  providers: [
    IntegratedRAGKPUService,
    KnowledgeValidationService,
    ValidationScoringService,
    ValidationCacheService,
    KPUMonitoringService,
    KPUConfigService,
    KPUHealthService,
  ],
  exports: [
    IntegratedRAGKPUService,
    KnowledgeValidationService,
    ValidationScoringService,
    ValidationCacheService,
    KPUMonitoringService,
    KPUConfigService,
    KPUHealthService,
  ],
})
export class KPUModule {}
