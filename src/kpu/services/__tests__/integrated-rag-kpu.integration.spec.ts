// src/kpu/services/__tests__/integrated-rag-kpu.integration.spec.ts
/**
 * IntegratedRAGKPUService 集成测试
 * 
 * 注意：这是集成测试，需要实际的数据库和RAG服务
 * 运行前请确保：
 * 1. 数据库连接正常
 * 2. RAG服务可用
 * 3. 有测试数据
 */

import { Test, TestingModule } from '@nestjs/testing';
import { IntegratedRAGKPUService } from '../integrated-rag-kpu.service';
import { ChunkRetrievalService } from '../../../rag/services/chunk-retrieval.service';
import { KnowledgeValidationService } from '../knowledge-validation.service';
import { ValidationScoringService } from '../validation-scoring.service';
import { LlmService } from '../../../llm/services/llm.service';
import { PrismaModule } from '../../../prisma/prisma.module';
import { RagModule } from '../../../rag/rag.module';
import { LlmModule } from '../../../llm/llm.module';
import { RedisModule } from '../../../redis/redis.module';
import { KPUModule } from '../../kpu.module';

describe('IntegratedRAGKPUService Integration', () => {
  let service: IntegratedRAGKPUService;
  let module: TestingModule;

  beforeAll(async () => {
    // 创建测试模块，使用真实的依赖
    module = await Test.createTestingModule({
      imports: [
        PrismaModule,
        RagModule,
        LlmModule,
        RedisModule,
        KPUModule,
      ],
    }).compile();

    service = module.get<IntegratedRAGKPUService>(IntegratedRAGKPUService);
  });

  afterAll(async () => {
    await module.close();
  });

  describe('retrieveAndValidate - Integration', () => {
    it('should retrieve and validate knowledge snippets end-to-end', async () => {
      // 跳过如果环境变量设置了跳过集成测试
      if (process.env.SKIP_INTEGRATION_TESTS === 'true') {
        console.log('Skipping integration test');
        return;
      }

      const result = await service.retrieveAndValidate({
        query: '冰岛旅游',
        limit: 5,
        enableSnippetValidation: true,
        minValidationScore: 0.5,
        validationOptions: {
          enableFactCheck: true,
          enableConsistencyCheck: true,
          enableCitationCheck: true,
        },
      });

      expect(result).toBeDefined();
      expect(result.results).toBeDefined();
      expect(Array.isArray(result.results)).toBe(true);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.totalCandidates).toBeGreaterThanOrEqual(0);
      expect(result.metadata.validatedCount).toBeGreaterThanOrEqual(0);
      expect(result.metadata.latency).toBeGreaterThan(0);
    }, 30000); // 30秒超时

    it('should filter low score results', async () => {
      if (process.env.SKIP_INTEGRATION_TESTS === 'true') {
        return;
      }

      const result = await service.retrieveAndValidate({
        query: '冰岛旅游',
        limit: 10,
        enableSnippetValidation: true,
        minValidationScore: 0.9, // 高阈值
      });

      // 所有结果应该都满足最低得分要求
      result.results.forEach(r => {
        expect(r.validation.overallScore).toBeGreaterThanOrEqual(0.9);
      });
    }, 30000);
  });

  describe('generateWithValidation - Integration', () => {
    it('should generate and validate answer end-to-end', async () => {
      if (process.env.SKIP_INTEGRATION_TESTS === 'true') {
        return;
      }

      // 先检索并验证
      const retrievalResult = await service.retrieveAndValidate({
        query: '冰岛F26公路冬天能走吗？',
        limit: 3,
        enableSnippetValidation: true,
      });

      if (retrievalResult.results.length === 0) {
        console.log('No results found, skipping generation test');
        return;
      }

      // 生成并验证
      const result = await service.generateWithValidation({
        query: '冰岛F26公路冬天能走吗？',
        validatedResults: retrievalResult.results,
        retryOnFailure: true,
        maxRetries: 2,
      });

      expect(result).toBeDefined();
      expect(result.answer).toBeDefined();
      expect(typeof result.answer).toBe('string');
      expect(result.answer.length).toBeGreaterThan(0);
      expect(result.validation).toBeDefined();
      expect(result.validation.overall).toBeDefined();
      expect(['pass', 'fail', 'warning']).toContain(result.validation.overall);
      expect(result.metadata).toBeDefined();
      expect(result.metadata.totalLatency).toBeGreaterThan(0);
    }, 60000); // 60秒超时（包含LLM调用）
  });
});
