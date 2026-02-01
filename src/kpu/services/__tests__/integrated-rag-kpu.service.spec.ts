// src/kpu/services/__tests__/integrated-rag-kpu.service.spec.ts
/**
 * IntegratedRAGKPUService 单元测试
 */

import { Test, TestingModule } from '@nestjs/testing';
import { IntegratedRAGKPUService } from '../integrated-rag-kpu.service';
import { ChunkRetrievalService } from '../../../rag/services/chunk-retrieval.service';
import { KnowledgeValidationService } from '../knowledge-validation.service';
import { ValidationScoringService } from '../validation-scoring.service';
import { LlmService } from '../../../llm/services/llm.service';

describe('IntegratedRAGKPUService', () => {
  let service: IntegratedRAGKPUService;
  let chunkRetrievalService: jest.Mocked<ChunkRetrievalService>;
  let validationService: jest.Mocked<KnowledgeValidationService>;
  let scoringService: jest.Mocked<ValidationScoringService>;
  let llmService: jest.Mocked<LlmService>;

  beforeEach(async () => {
    const mockChunkRetrievalService = {
      retrieve: jest.fn(),
    };

    const mockValidationService = {
      validateSnippet: jest.fn(),
      validateOutput: jest.fn(),
    };

    const mockScoringService = {
      calculateOverallScore: jest.fn(),
    };

    const mockLlmService = {
      callLlmWithSchema: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IntegratedRAGKPUService,
        {
          provide: ChunkRetrievalService,
          useValue: mockChunkRetrievalService,
        },
        {
          provide: KnowledgeValidationService,
          useValue: mockValidationService,
        },
        {
          provide: ValidationScoringService,
          useValue: mockScoringService,
        },
        {
          provide: LlmService,
          useValue: mockLlmService,
        },
      ],
    }).compile();

    service = module.get<IntegratedRAGKPUService>(IntegratedRAGKPUService);
    chunkRetrievalService = module.get(ChunkRetrievalService);
    validationService = module.get(KnowledgeValidationService);
    scoringService = module.get(ValidationScoringService);
    llmService = module.get(LlmService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('retrieveAndValidate', () => {
    it('should retrieve and validate knowledge snippets', async () => {
      const mockCandidates = [
        {
          id: 'chunk_1',
          chunkId: 'chunk_1',
          content: 'test content 1',
          similarity: 0.9,
          credibilityScore: 0.8,
        },
        {
          id: 'chunk_2',
          chunkId: 'chunk_2',
          content: 'test content 2',
          similarity: 0.8,
          credibilityScore: 0.7,
        },
      ];

      chunkRetrievalService.retrieve.mockResolvedValue(mockCandidates as any);
      validationService.validateSnippet.mockResolvedValue({
        factCheck: 'pass',
        sourceCredibility: 0.8,
        freshness: 0.9,
        completeness: 0.8,
        consistency: 'consistent',
        citations: [],
      });
      scoringService.calculateOverallScore.mockReturnValue(0.85);

      const result = await service.retrieveAndValidate({
        query: 'test query',
        limit: 10,
        enableSnippetValidation: true,
      });

      expect(result).toBeDefined();
      expect(result.results).toBeDefined();
      expect(result.metadata).toBeDefined();
      expect(result.metadata.totalCandidates).toBe(2);
    });

    it('should filter low score results', async () => {
      const mockCandidates = [
        {
          id: 'chunk_1',
          chunkId: 'chunk_1',
          content: 'test content 1',
          similarity: 0.9,
          credibilityScore: 0.8,
        },
      ];

      chunkRetrievalService.retrieve.mockResolvedValue(mockCandidates as any);
      validationService.validateSnippet.mockResolvedValue({
        factCheck: 'pass',
        sourceCredibility: 0.8,
        freshness: 0.9,
        completeness: 0.8,
        consistency: 'consistent',
        citations: [],
      });
      scoringService.calculateOverallScore.mockReturnValue(0.3); // 低分

      const result = await service.retrieveAndValidate({
        query: 'test query',
        limit: 10,
        enableSnippetValidation: true,
        minValidationScore: 0.5,
      });

      expect(result.results.length).toBe(0); // 应该被过滤掉
    });
  });

  describe('generateWithValidation', () => {
    it('should generate answer and validate', async () => {
      const mockValidatedResults = [
        {
          id: 'chunk_1',
          content: 'test content',
          validation: {
            overallScore: 0.85,
          },
        },
      ] as any;

      llmService.callLlmWithSchema.mockResolvedValue('Generated answer');
      validationService.validateOutput.mockResolvedValue({
        overall: 'pass',
        score: 85,
        factChecks: [],
        consistencyChecks: [],
        citations: [],
        warnings: [],
      });

      const result = await service.generateWithValidation({
        query: 'test query',
        validatedResults: mockValidatedResults,
      });

      expect(result).toBeDefined();
      expect(result.answer).toBeDefined();
      expect(result.validation).toBeDefined();
      expect(result.retried).toBe(false);
    });

    it('should retry on validation failure', async () => {
      const mockValidatedResults = [
        {
          id: 'chunk_1',
          content: 'test content',
          validation: {
            overallScore: 0.9, // 高分
          },
        },
      ] as any;

      llmService.callLlmWithSchema
        .mockResolvedValueOnce('First answer')
        .mockResolvedValueOnce('Retry answer');

      validationService.validateOutput
        .mockResolvedValueOnce({
          overall: 'fail',
          score: 50,
          factChecks: [],
          consistencyChecks: [],
          citations: [],
          warnings: [],
        })
        .mockResolvedValueOnce({
          overall: 'pass',
          score: 85,
          factChecks: [],
          consistencyChecks: [],
          citations: [],
          warnings: [],
        });

      const result = await service.generateWithValidation({
        query: 'test query',
        validatedResults: mockValidatedResults,
        retryOnFailure: true,
        maxRetries: 2,
      });

      expect(result).toBeDefined();
      expect(result.retried).toBe(true);
      expect(result.validation.overall).toBe('pass');
    });
  });
});
