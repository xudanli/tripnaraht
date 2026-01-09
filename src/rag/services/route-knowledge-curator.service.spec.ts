// src/rag/services/route-knowledge-curator.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { RouteKnowledgeCurator, RoutePhilosophyNarrative, SegmentNarrative } from './route-knowledge-curator.service';
import { PrismaService } from '../../prisma/prisma.service';
import { RagService } from './rag.service';
import { LlmExtractionService } from './llm-extraction.service';

describe('RouteKnowledgeCurator', () => {
  let service: RouteKnowledgeCurator;
  let prisma: jest.Mocked<PrismaService>;
  let ragService: jest.Mocked<RagService>;
  let llmExtraction: jest.Mocked<LlmExtractionService>;

  beforeEach(async () => {
    const mockPrisma = {
      routeDirection: {
        findUnique: jest.fn(),
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
        RouteKnowledgeCurator,
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

    service = module.get<RouteKnowledgeCurator>(RouteKnowledgeCurator);
    prisma = module.get(PrismaService);
    ragService = module.get(RagService);
    llmExtraction = module.get(LlmExtractionService);
  });

  it('应该被定义', () => {
    expect(service).toBeDefined();
  });

  describe('enrichRouteNarrative', () => {
    const mockRouteDirection = {
      id: 1,
      nameCN: '冰岛高地环线',
      nameEN: 'Iceland Highlands Loop',
      description: '一条穿越冰岛高地的经典路线',
      countryCode: 'IS',
    };

    const mockRagSnippets = [
      {
        id: '1',
        content: '这是一条非常经典的路线，适合有经验的旅行者',
        title: 'Travel Guide',
        score: 0.9,
      },
    ];

    const mockNarrative: Omit<RoutePhilosophyNarrative, 'routeDirectionId'> = {
      philosophyExplanation: '这条路线展现了冰岛高地的原始美',
      whyThisRoute: ['风景优美', '挑战性强'],
      whatToExpect: ['壮观的风景', '独特的体验'],
      commonMistakes: ['准备不足', '低估难度'],
      evidenceSnippets: ['证据1', '证据2'],
    };

    it('应该成功生成路线叙事', async () => {
      // @ts-ignore
      prisma.routeDirection.findUnique.mockResolvedValue(mockRouteDirection);
      ragService.retrieve.mockResolvedValue(mockRagSnippets);
      llmExtraction.extractStructured.mockResolvedValue(mockNarrative);

      const result = await service.enrichRouteNarrative('1', 'IS');

      expect(prisma.routeDirection.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(ragService.retrieve).toHaveBeenCalled();
      expect(llmExtraction.extractStructured).toHaveBeenCalled();
      expect(result.routeDirectionId).toBe('1');
      expect(result.philosophyExplanation).toBe(mockNarrative.philosophyExplanation);
    });

    it('应该在未找到路线时抛出错误', async () => {
      // @ts-ignore
      prisma.routeDirection.findUnique.mockResolvedValue(null);

      await expect(service.enrichRouteNarrative('999', 'IS')).rejects.toThrow(
        'RouteDirection not found'
      );
    });

    it('应该在未找到 RAG 内容时返回基础叙事', async () => {
      // @ts-ignore
      prisma.routeDirection.findUnique.mockResolvedValue(mockRouteDirection);
      ragService.retrieve.mockResolvedValue([]);

      const result = await service.enrichRouteNarrative('1', 'IS');

      expect(result.routeDirectionId).toBe('1');
      expect(result.philosophyExplanation).toContain('一条穿越冰岛高地的经典路线');
    });

    it('应该使用 countryCode 参数（如果提供）', async () => {
      // @ts-ignore
      prisma.routeDirection.findUnique.mockResolvedValue({
        ...mockRouteDirection,
        countryCode: 'NO',
      });
      ragService.retrieve.mockResolvedValue([]);

      await service.enrichRouteNarrative('1', 'IS');

      expect(ragService.retrieve).toHaveBeenCalledWith(
        expect.objectContaining({
          countryCode: 'IS', // 使用传入的 countryCode，而不是路线中的
        })
      );
    });
  });

  describe('enrichSegmentNarrative', () => {
    const mockRagSnippets = [
      {
        id: '1',
        content: '第一天的行程非常精彩',
        title: 'Day 1 Guide',
        score: 0.85,
      },
    ];

    const mockNarrative: Omit<SegmentNarrative, 'segmentId' | 'dayIndex'> = {
      storyText: '第一天的故事',
      practicalTips: ['建议1', '建议2'],
      localInsights: ['洞察1'],
      evidenceSnippets: ['证据1'],
    };

    it('应该成功生成路线段叙事', async () => {
      ragService.retrieve.mockResolvedValue(mockRagSnippets);
      llmExtraction.extractStructured.mockResolvedValue(mockNarrative);

      const result = await service.enrichSegmentNarrative('segment-1', 1, {
        name: '第一天',
        description: '第一天的描述',
        countryCode: 'IS',
      });

      expect(ragService.retrieve).toHaveBeenCalled();
      expect(llmExtraction.extractStructured).toHaveBeenCalled();
      expect(result.segmentId).toBe('segment-1');
      expect(result.dayIndex).toBe(1);
      expect(result.storyText).toBe(mockNarrative.storyText);
    });

    it('应该在未找到 RAG 内容时返回基础叙事', async () => {
      ragService.retrieve.mockResolvedValue([]);

      const result = await service.enrichSegmentNarrative('segment-1', 1, {
        name: '第一天',
        description: '第一天的描述',
        countryCode: 'IS',
      });

      expect(result.segmentId).toBe('segment-1');
      expect(result.dayIndex).toBe(1);
      expect(result.storyText).toBe('第一天的描述');
      expect(result.practicalTips).toEqual([]);
    });

    it('应该处理 LLM 生成失败', async () => {
      ragService.retrieve.mockResolvedValue(mockRagSnippets);
      llmExtraction.extractStructured.mockRejectedValue(new Error('LLM 失败'));

      const result = await service.enrichSegmentNarrative('segment-1', 1, {
        name: '第一天',
        countryCode: 'IS',
      });

      // 应该返回基础叙事，而不是抛出错误
      expect(result.segmentId).toBe('segment-1');
      expect(result.storyText).toBeDefined();
    });
  });

  describe('enrichMultipleRoutes', () => {
    it('应该批量生成多个路线的叙事', async () => {
      const mockRoute = {
        id: 1,
        nameCN: '测试路线',
        countryCode: 'IS',
      };

      // @ts-ignore
      prisma.routeDirection.findUnique.mockResolvedValue(mockRoute);
      ragService.retrieve.mockResolvedValue([]);

      const result = await service.enrichMultipleRoutes(['1', '2'], 'IS');

      expect(result).toHaveLength(2);
      expect(prisma.routeDirection.findUnique).toHaveBeenCalledTimes(2);
    });

    it('应该处理部分路线生成失败', async () => {
      const mockRoute = {
        id: 1,
        nameCN: '测试路线',
        countryCode: 'IS',
      };

      // @ts-ignore
      prisma.routeDirection.findUnique
        .mockResolvedValueOnce(mockRoute)
        .mockResolvedValueOnce(null); // 第二个路线不存在
      ragService.retrieve.mockResolvedValue([]);

      const result = await service.enrichMultipleRoutes(['1', '999'], 'IS');

      // 应该只返回成功生成的路线
      expect(result.length).toBeLessThanOrEqual(1);
    });
  });
});
