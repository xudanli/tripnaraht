// src/kpu/services/__tests__/knowledge-validation.service.spec.ts
/**
 * KnowledgeValidationService 单元测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { KnowledgeValidationService } from '../knowledge-validation.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { LlmService } from '../../../llm/services/llm.service';
import { ValidationCacheService } from '../validation-cache.service';

describe('KnowledgeValidationService', () => {
  let service: KnowledgeValidationService;
  let prismaService: jest.Mocked<PrismaService>;
  let llmService: jest.Mocked<LlmService>;
  let cacheService: jest.Mocked<ValidationCacheService>;

  beforeEach(async () => {
    const mockPrismaService = {
      // 添加需要的Prisma方法mock
    };

    const mockLlmService = {
      callLlmWithSchema: jest.fn(),
    };

    const mockCacheService = {
      getCachedSnippetValidation: jest.fn(),
      cacheSnippetValidation: jest.fn(),
      getCachedOutputValidation: jest.fn(),
      cacheOutputValidation: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KnowledgeValidationService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: LlmService,
          useValue: mockLlmService,
        },
        {
          provide: ValidationCacheService,
          useValue: mockCacheService,
        },
      ],
    }).compile();

    service = module.get<KnowledgeValidationService>(KnowledgeValidationService);
    prismaService = module.get(PrismaService);
    llmService = module.get(LlmService);
    cacheService = module.get(ValidationCacheService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('validateSnippet', () => {
    it('should return cached result if available', async () => {
      const cachedResult = {
        factCheck: 'pass' as const,
        sourceCredibility: 0.9,
        freshness: 0.9,
        completeness: 0.8,
        consistency: 'consistent' as const,
        citations: [],
      };

      cacheService.getCachedSnippetValidation.mockResolvedValue(cachedResult);

      const result = await service.validateSnippet({
        content: 'test content',
        options: {
          enableFactCheck: true,
          enableConsistencyCheck: true,
          enableCitationCheck: true,
        },
      });

      expect(result).toEqual(cachedResult);
      expect(cacheService.getCachedSnippetValidation).toHaveBeenCalled();
    });

    it('should validate snippet and cache result', async () => {
      cacheService.getCachedSnippetValidation.mockResolvedValue(null);
      llmService.callLlmWithSchema.mockResolvedValue('pass');

      const result = await service.validateSnippet({
        content: 'test content',
        source: 'test source',
        options: {
          enableFactCheck: true,
          enableConsistencyCheck: true,
          enableCitationCheck: true,
        },
      });

      expect(result).toBeDefined();
      expect(result.factCheck).toBeDefined();
      expect(result.sourceCredibility).toBeDefined();
      expect(cacheService.cacheSnippetValidation).toHaveBeenCalled();
    });
  });

  describe('validateOutput', () => {
    it('should return cached result if available', async () => {
      const cachedResult = {
        overall: 'pass' as const,
        score: 85,
        factChecks: [],
        consistencyChecks: [],
        citations: [],
        warnings: [],
      };

      cacheService.getCachedOutputValidation.mockResolvedValue(cachedResult);

      const result = await service.validateOutput({
        output: 'test output',
        sources: [],
        query: 'test query',
        options: {
          enableFactCheck: true,
          enableConsistencyCheck: true,
          enableCitationCheck: true,
          enableCompletenessCheck: true,
        },
      });

      expect(result).toEqual(cachedResult);
      expect(cacheService.getCachedOutputValidation).toHaveBeenCalled();
    });

    it('should validate output and cache result', async () => {
      cacheService.getCachedOutputValidation.mockResolvedValue(null);
      llmService.callLlmWithSchema.mockResolvedValue('{}');

      const result = await service.validateOutput({
        output: 'test output',
        sources: [],
        query: 'test query',
        options: {
          enableFactCheck: true,
          enableConsistencyCheck: true,
          enableCitationCheck: true,
          enableCompletenessCheck: true,
        },
      });

      expect(result).toBeDefined();
      expect(result.overall).toBeDefined();
      expect(result.score).toBeDefined();
      expect(cacheService.cacheOutputValidation).toHaveBeenCalled();
    });
  });
});
