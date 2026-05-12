// src/rag/services/compliance-facts-agent.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ComplianceFactsAgent, RailPassRule, TrailAccessRule } from './compliance-facts-agent.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ChunkRetrievalService } from './chunk-retrieval.service';
import { LlmExtractionService } from './llm-extraction.service';
import { RagRealityPolicyGateService } from './rag-reality-policy-gate.service';

describe('ComplianceFactsAgent', () => {
  let service: ComplianceFactsAgent;
  let prisma: jest.Mocked<PrismaService>;
  let chunkRetrieval: jest.Mocked<Pick<ChunkRetrievalService, 'retrieve'>>;
  let llmExtraction: jest.Mocked<LlmExtractionService>;

  const minimalChunk = {
    id: '1',
    chunkId: 'c1',
    content: 'Eurail Global Pass is valid in 33 European countries. Reservation required for high-speed trains.',
    type: 'text',
    credibilityScore: 0.9,
    keywords: [] as string[],
    metadata: { sourceUrl: 'https://example.com' },
    fileId: 'f1',
    similarity: 0.9,
    sourceFile: 'https://example.com',
  };

  beforeEach(async () => {
    process.env.REALITY_ENFORCEMENT = '0';
    process.env.RAG_REALITY_POLICY_ENFORCE = '0';

    const mockPrisma = {
      complianceEvidence: {
        createMany: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const mockChunkRetrieval = {
      retrieve: jest.fn(),
    };

    const mockLlmExtraction = {
      extractStructured: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComplianceFactsAgent,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: ChunkRetrievalService,
          useValue: mockChunkRetrieval,
        },
        {
          provide: LlmExtractionService,
          useValue: mockLlmExtraction,
        },
        RagRealityPolicyGateService,
      ],
    }).compile();

    service = module.get<ComplianceFactsAgent>(ComplianceFactsAgent);
    prisma = module.get(PrismaService);
    chunkRetrieval = module.get(ChunkRetrievalService);
    llmExtraction = module.get(LlmExtractionService);
  });

  it('应该被定义', () => {
    expect(service).toBeDefined();
  });

  describe('extractRailPassRules', () => {
    const mockRules: RailPassRule[] = [
      {
        passType: 'EURAIL_GLOBAL',
        eligibleTraveler: {
          regions: ['non-europe'],
        },
        validCountries: ['FR', 'DE', 'IT'],
        requiresReservation: true,
        seatReservationFee: 10,
        notValidOn: [],
      },
    ];

    it('应该成功提取 Rail Pass 规则', async () => {
      chunkRetrieval.retrieve.mockResolvedValue([minimalChunk]);
      llmExtraction.extractStructured.mockResolvedValue(mockRules);
      prisma.complianceEvidence.createMany.mockResolvedValue({ count: 1 } as any);

      const result = await service.extractRailPassRules('Eurail Global Pass', 'FR');

      expect(chunkRetrieval.retrieve).toHaveBeenCalledWith(
        expect.objectContaining({
          query: 'Eurail Global Pass rules for FR',
          category: 'compliance_rules',
          chunkCategory: 'RULES',
          limit: 10,
          useHybridSearch: true,
        }),
      );
      expect(llmExtraction.extractStructured).toHaveBeenCalled();
      expect(prisma.complianceEvidence.createMany).toHaveBeenCalled();
      expect(result).toEqual(mockRules);
    });

    it('应该在未找到文档时返回空数组', async () => {
      chunkRetrieval.retrieve.mockResolvedValue([]);

      const result = await service.extractRailPassRules('Eurail Global Pass', 'FR');

      expect(result).toEqual([]);
      expect(llmExtraction.extractStructured).not.toHaveBeenCalled();
      expect(prisma.complianceEvidence.createMany).not.toHaveBeenCalled();
    });

    it('应该处理 LLM 提取失败', async () => {
      chunkRetrieval.retrieve.mockResolvedValue([minimalChunk]);
      llmExtraction.extractStructured.mockRejectedValue(new Error('LLM 提取失败'));

      await expect(service.extractRailPassRules('Eurail Global Pass', 'FR')).rejects.toThrow('LLM 提取失败');
    });

    describe('门禁开启且无 decisionContext', () => {
      beforeEach(() => {
        process.env.RAG_REALITY_POLICY_ENFORCE = '1';
      });

      it('应返回空数组且不检索', async () => {
        const result = await service.extractRailPassRules('Eurail Global Pass', 'FR');
        expect(result).toEqual([]);
        expect(chunkRetrieval.retrieve).not.toHaveBeenCalled();
      });
    });
  });

  describe('extractTrailAccessRules', () => {
    const mockRagSnippets = [
      {
        ...minimalChunk,
        content:
          'This trail requires a permit. Booking must be made 30 days in advance.',
      },
    ];

    const mockRules: TrailAccessRule[] = [
      {
        trailId: 'trail-1',
        requiresPermit: true,
        permitType: 'DAILY',
        permitCost: 20,
        bookingRequired: true,
        bookingAdvanceDays: 30,
      },
    ];

    it('应该成功提取 Trail Access 规则', async () => {
      chunkRetrieval.retrieve.mockResolvedValue(mockRagSnippets);
      llmExtraction.extractStructured.mockResolvedValue(mockRules);
      prisma.complianceEvidence.createMany.mockResolvedValue({ count: 1 } as any);

      const result = await service.extractTrailAccessRules('trail-1', 'IS');

      expect(chunkRetrieval.retrieve).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.stringContaining('trail-1'),
          category: 'compliance_rules',
          chunkCategory: 'RULES',
          limit: 10,
          useHybridSearch: true,
        }),
      );
      expect(llmExtraction.extractStructured).toHaveBeenCalled();
      expect(result).toEqual(mockRules);
    });

    it('应该在未找到文档时返回空数组', async () => {
      chunkRetrieval.retrieve.mockResolvedValue([]);

      const result = await service.extractTrailAccessRules('trail-1', 'IS');

      expect(result).toEqual([]);
    });
  });

  describe('refreshComplianceRules', () => {
    it('应该刷新所有合规规则', async () => {
      chunkRetrieval.retrieve.mockResolvedValue([
        {
          ...minimalChunk,
          content: 'Updated rules',
        },
      ]);
      llmExtraction.extractStructured.mockResolvedValue([]);
      prisma.complianceEvidence.createMany.mockResolvedValue({ count: 0 } as any);

      await service.refreshComplianceRules();

      expect(chunkRetrieval.retrieve).toHaveBeenCalled();
      expect(llmExtraction.extractStructured).toHaveBeenCalled();
    });
  });
});
