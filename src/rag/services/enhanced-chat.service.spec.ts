// src/rag/services/enhanced-chat.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { EnhancedChatService, RouteQuestionContext } from './enhanced-chat.service';
import { ChunkRetrievalService } from './chunk-retrieval.service';
import { RouteKnowledgeCurator } from './route-knowledge-curator.service';
import { LocalInsightService } from './local-insight.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RagRealityPolicyGateService } from './rag-reality-policy-gate.service';

describe('EnhancedChatService', () => {
  let service: EnhancedChatService;
  let chunkRetrieval: jest.Mocked<Pick<ChunkRetrievalService, 'retrieve'>>;
  let routeKnowledgeCurator: jest.Mocked<RouteKnowledgeCurator>;
  let localInsightService: jest.Mocked<LocalInsightService>;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    process.env.REALITY_ENFORCEMENT = '0';
    process.env.RAG_REALITY_POLICY_ENFORCE = '0';

    const mockChunkRetrieval = {
      retrieve: jest.fn(),
    };

    const mockRouteKnowledgeCurator = {
      enrichRouteNarrative: jest.fn(),
      enrichSegmentNarrative: jest.fn(),
    };

    const mockLocalInsightService = {
      getLocalInsight: jest.fn(),
    };

    const mockPrisma = {
      routeDirection: {
        findUnique: jest.fn(),
      },
      trip: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnhancedChatService,
        {
          provide: ChunkRetrievalService,
          useValue: mockChunkRetrieval,
        },
        {
          provide: RouteKnowledgeCurator,
          useValue: mockRouteKnowledgeCurator,
        },
        {
          provide: LocalInsightService,
          useValue: mockLocalInsightService,
        },
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: RagRealityPolicyGateService,
          useValue: {
            resolve: jest.fn(),
            mergeChunkRetrievalParams: jest.fn((p: unknown) => p),
          },
        },
      ],
    }).compile();

    service = module.get<EnhancedChatService>(EnhancedChatService);
    chunkRetrieval = module.get(ChunkRetrievalService);
    routeKnowledgeCurator = module.get(RouteKnowledgeCurator);
    localInsightService = module.get(LocalInsightService);
    prisma = module.get(PrismaService);
  });

  it('应该被定义', () => {
    expect(service).toBeDefined();
  });

  describe('answerRouteQuestion', () => {
    it('应该使用结构化数据回答（如果可用）', async () => {
      prisma.routeDirection.findUnique.mockResolvedValue({
        id: 1,
        nameCN: '测试路线',
        description: '这是测试路线描述',
        countryCode: 'IS',
      } as any);

      const context: RouteQuestionContext = {
        routeDirectionId: '1',
        countryCode: 'IS',
      };

      const result = await service.answerRouteQuestion('这条路线怎么样？', context);

      expect(result).toBeDefined();
      expect(result.source).toBeDefined();
    });

    it('应该使用 RAG 补充回答（当结构化数据不够时）', async () => {
      prisma.routeDirection.findUnique.mockResolvedValue(null);
      chunkRetrieval.retrieve.mockResolvedValue([
        {
          id: '1',
          chunkId: 'c1',
          content: '这是 RAG 检索到的内容',
          type: 'text',
          credibilityScore: 0.8,
          keywords: [] as string[],
          metadata: { title: 'RAG 文档' },
          fileId: 'f1',
          similarity: 0.8,
          sourceFile: 'doc.md',
        },
      ] as any);
      localInsightService.getLocalInsight.mockResolvedValue([
        {
          countryCode: 'IS',
          tags: ['culture'],
          content: '当地文化洞察',
          evidenceSnippets: [],
          confidence: 'HIGH',
        },
      ]);

      const context: RouteQuestionContext = {
        countryCode: 'IS',
      };

      const result = await service.answerRouteQuestion('这条路线怎么样？', context);

      expect(chunkRetrieval.retrieve).toHaveBeenCalled();
      expect(result.source).toMatch(/RAG|HYBRID/);
    });

    it('应该处理错误情况', async () => {
      prisma.routeDirection.findUnique.mockRejectedValue(new Error('数据库错误'));
      chunkRetrieval.retrieve.mockResolvedValue([]);

      const context: RouteQuestionContext = {
        routeDirectionId: '1',
      };

      const result = await service.answerRouteQuestion('这条路线怎么样？', context);

      expect(result.answer).toContain('抱歉');
      expect(result.source).toMatch(/STRUCTURED|RAG/);
    });
  });

  describe('explainWhyNotOtherRoute', () => {
    it('应该解释为什么选择某条路线', async () => {
      prisma.routeDirection.findUnique
        .mockResolvedValueOnce({
          id: 1,
          nameCN: '路线A',
          nameEN: 'Route A',
        } as any)
        .mockResolvedValueOnce({
          id: 2,
          nameCN: '路线B',
          nameEN: 'Route B',
        } as any);

      const chunkRow = (content: string, sim: number) => ({
        id: '1',
        chunkId: 'c1',
        content,
        type: 'text',
        credibilityScore: sim,
        keywords: [] as string[],
        metadata: {},
        fileId: 'f1',
        similarity: sim,
        sourceFile: 'x.md',
      });
      chunkRetrieval.retrieve
        .mockResolvedValueOnce([chunkRow('路线A更适合', 0.8)] as any)
        .mockResolvedValueOnce([chunkRow('路线B的特点', 0.7)] as any);

      const result = await service.explainWhyNotOtherRoute('1', '2', 'IS');

      expect(prisma.routeDirection.findUnique).toHaveBeenCalledTimes(2);
      expect(chunkRetrieval.retrieve).toHaveBeenCalledTimes(2);
      expect(result).toBeDefined();
      expect(result.source).toBe('HYBRID');
    });

    it('应该在路线不存在时返回错误消息', async () => {
      prisma.routeDirection.findUnique.mockResolvedValue(null);

      const result = await service.explainWhyNotOtherRoute('999', '998', 'IS');

      expect(result.answer).toContain('无法找到路线信息');
      expect(result.source).toBe('STRUCTURED');
    });
  });

  describe('getRouteNarrative', () => {
    it('应该获取路线叙事', async () => {
      routeKnowledgeCurator.enrichRouteNarrative.mockResolvedValue({
        routeDirectionId: '1',
        philosophyExplanation: '路线哲学',
        whyThisRoute: ['原因1'],
        whatToExpect: ['预期1'],
        commonMistakes: ['错误1'],
        evidenceSnippets: ['证据1'],
      });

      const result = await service.getRouteNarrative('1', 'IS');

      expect(routeKnowledgeCurator.enrichRouteNarrative).toHaveBeenCalledWith('1', 'IS', undefined);
      expect(result).toBeDefined();
    });
  });
});
