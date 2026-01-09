// src/rag/services/enhanced-chat.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { EnhancedChatService, RouteQuestionContext } from './enhanced-chat.service';
import { RagService } from './rag.service';
import { RouteKnowledgeCurator } from './route-knowledge-curator.service';
import { LocalInsightService } from './local-insight.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('EnhancedChatService', () => {
  let service: EnhancedChatService;
  let ragService: jest.Mocked<RagService>;
  let routeKnowledgeCurator: jest.Mocked<RouteKnowledgeCurator>;
  let localInsightService: jest.Mocked<LocalInsightService>;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockRagService = {
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
          provide: RagService,
          useValue: mockRagService,
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
      ],
    }).compile();

    service = module.get<EnhancedChatService>(EnhancedChatService);
    ragService = module.get(RagService);
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
      ragService.retrieve.mockResolvedValue([
        {
          id: '1',
          content: '这是 RAG 检索到的内容',
          title: 'RAG 文档',
          score: 0.8,
        },
      ]);
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

      expect(ragService.retrieve).toHaveBeenCalled();
      expect(result.source).toMatch(/RAG|HYBRID/);
    });

    it('应该处理错误情况', async () => {
      prisma.routeDirection.findUnique.mockRejectedValue(new Error('数据库错误'));

      const context: RouteQuestionContext = {
        routeDirectionId: '1',
      };

      const result = await service.answerRouteQuestion('这条路线怎么样？', context);

      expect(result.answer).toContain('抱歉');
      expect(result.source).toBe('STRUCTURED');
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

      ragService.retrieve
        .mockResolvedValueOnce([
          {
            id: '1',
            content: '路线A更适合',
            title: '路线对比',
            score: 0.8,
          },
        ])
        .mockResolvedValueOnce([
          {
            id: '2',
            content: '路线B的特点',
            title: '路线B',
            score: 0.7,
          },
        ]);

      const result = await service.explainWhyNotOtherRoute('1', '2', 'IS');

      expect(prisma.routeDirection.findUnique).toHaveBeenCalledTimes(2);
      expect(ragService.retrieve).toHaveBeenCalledTimes(2);
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

      expect(routeKnowledgeCurator.enrichRouteNarrative).toHaveBeenCalledWith('1', 'IS');
      expect(result).toBeDefined();
    });
  });
});
