// src/rag/services/compliance-facts-agent.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { ComplianceFactsAgent, RailPassRule, TrailAccessRule } from './compliance-facts-agent.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RagService } from './rag.service';
import { LlmExtractionService } from './llm-extraction.service';

describe('ComplianceFactsAgent', () => {
  let service: ComplianceFactsAgent;
  let prisma: jest.Mocked<PrismaService>;
  let ragService: jest.Mocked<RagService>;
  let llmExtraction: jest.Mocked<LlmExtractionService>;

  beforeEach(async () => {
    const mockPrisma = {
      complianceEvidence: {
        createMany: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const mockRagService = {
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
          provide: RagService,
          useValue: mockRagService,
        },
        {
          provide: LlmExtractionService,
          useValue: mockLlmExtraction,
        },
      ],
    }).compile();

    service = module.get<ComplianceFactsAgent>(ComplianceFactsAgent);
    prisma = module.get(PrismaService);
    ragService = module.get(RagService);
    llmExtraction = module.get(LlmExtractionService);
  });

  it('应该被定义', () => {
    expect(service).toBeDefined();
  });

  describe('extractRailPassRules', () => {
    const mockRagSnippets = [
      {
        id: '1',
        content: 'Eurail Global Pass is valid in 33 European countries. Reservation required for high-speed trains.',
        title: 'Eurail Rules',
        score: 0.9,
        source: 'https://example.com',
      },
    ];

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
      ragService.retrieve.mockResolvedValue(mockRagSnippets);
      llmExtraction.extractStructured.mockResolvedValue(mockRules);
      prisma.complianceEvidence.createMany.mockResolvedValue({ count: 1 } as any);

      const result = await service.extractRailPassRules('Eurail Global Pass', 'FR');

      expect(ragService.retrieve).toHaveBeenCalledWith({
        query: 'Eurail Global Pass rules for FR',
        collection: 'rail_pass_rules',
        countryCode: 'FR',
        limit: 10,
      });
      expect(llmExtraction.extractStructured).toHaveBeenCalled();
      expect(prisma.complianceEvidence.createMany).toHaveBeenCalled();
      expect(result).toEqual(mockRules);
    });

    it('应该在未找到文档时返回空数组', async () => {
      ragService.retrieve.mockResolvedValue([]);

      const result = await service.extractRailPassRules('Eurail Global Pass', 'FR');

      expect(result).toEqual([]);
      expect(llmExtraction.extractStructured).not.toHaveBeenCalled();
      expect(prisma.complianceEvidence.createMany).not.toHaveBeenCalled();
    });

    it('应该处理 LLM 提取失败', async () => {
      ragService.retrieve.mockResolvedValue(mockRagSnippets);
      llmExtraction.extractStructured.mockRejectedValue(new Error('LLM 提取失败'));

      await expect(
        service.extractRailPassRules('Eurail Global Pass', 'FR')
      ).rejects.toThrow('LLM 提取失败');
    });
  });

  describe('extractTrailAccessRules', () => {
    const mockRagSnippets = [
      {
        id: '1',
        content: 'This trail requires a permit. Booking must be made 30 days in advance.',
        title: 'Trail Access Rules',
        score: 0.85,
        source: 'https://example.com',
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
      ragService.retrieve.mockResolvedValue(mockRagSnippets);
      llmExtraction.extractStructured.mockResolvedValue(mockRules);
      prisma.complianceEvidence.createMany.mockResolvedValue({ count: 1 } as any);

      const result = await service.extractTrailAccessRules('trail-1', 'IS');

      expect(ragService.retrieve).toHaveBeenCalledWith({
        query: expect.stringContaining('trail-1'),
        collection: 'trail_access_rules',
        countryCode: 'IS',
        limit: 10,
      });
      expect(llmExtraction.extractStructured).toHaveBeenCalled();
      expect(result).toEqual(mockRules);
    });

    it('应该在未找到文档时返回空数组', async () => {
      ragService.retrieve.mockResolvedValue([]);

      const result = await service.extractTrailAccessRules('trail-1', 'IS');

      expect(result).toEqual([]);
    });
  });

  describe('refreshComplianceRules', () => {
    it('应该刷新所有合规规则', async () => {
      // refreshComplianceRules 会遍历多个国家和 passType，调用 extractRailPassRules
      ragService.retrieve.mockResolvedValue([
        {
          id: '1',
          content: 'Updated rules',
          title: 'Rules',
          score: 0.9,
        },
      ]);
      llmExtraction.extractStructured.mockResolvedValue([]);
      prisma.complianceEvidence.createMany.mockResolvedValue({ count: 0 } as any);

      await service.refreshComplianceRules();

      // 应该为每个国家和 passType 组合调用 extractRailPassRules
      // 默认有 5 个国家 × 4 个 passType = 20 次调用
      expect(ragService.retrieve).toHaveBeenCalled();
      expect(llmExtraction.extractStructured).toHaveBeenCalled();
    });
  });
});
