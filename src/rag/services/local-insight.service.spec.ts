// src/rag/services/local-insight.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { LocalInsightService } from './local-insight.service';
import { PrismaService } from '../../prisma/prisma.service';
import { ChunkRetrievalService } from './chunk-retrieval.service';
import { RagRealityPolicyGateService } from './rag-reality-policy-gate.service';
import { LlmExtractionService } from './llm-extraction.service';

describe('LocalInsightService', () => {
  let service: LocalInsightService;
  let prisma: jest.Mocked<PrismaService>;
  let chunkRetrieval: jest.Mocked<Pick<ChunkRetrievalService, 'retrieve'>>;
  let llmExtraction: jest.Mocked<LlmExtractionService>;

  beforeEach(async () => {
    process.env.REALITY_ENFORCEMENT = '0';
    process.env.RAG_REALITY_POLICY_ENFORCE = '0';

    const mockPrisma = {
      localInsight: {
        findMany: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
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
        LocalInsightService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: ChunkRetrievalService,
          useValue: mockChunkRetrieval,
        },
        {
          provide: RagRealityPolicyGateService,
          useValue: {
            mergeChunkRetrievalParams: jest.fn((p: unknown) => p),
          },
        },
        {
          provide: LlmExtractionService,
          useValue: mockLlmExtraction,
        },
      ],
    }).compile();

    service = module.get<LocalInsightService>(LocalInsightService);
    prisma = module.get(PrismaService);
    chunkRetrieval = module.get(ChunkRetrievalService);
    llmExtraction = module.get(LlmExtractionService);
  });

  it('应该被定义', () => {
    expect(service).toBeDefined();
  });

  describe('getLocalInsight', () => {
    it('应该使用缓存的洞察（如果存在且较新）', async () => {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 20); // 20 天前，在 30 天缓存期内

      const mockCached = [
        {
          id: '1',
          countryCode: 'IS',
          region: null,
          tags: ['culture'],
          content: '缓存的内容',
          evidenceSnippets: ['证据1'],
          confidence: 'HIGH',
          source: null,
          lastUpdated: thirtyDaysAgo,
        },
      ];

      // @ts-ignore
      prisma.localInsight.findMany.mockResolvedValue(mockCached);

      const result = await service.getLocalInsight('IS', ['culture']);

      expect(prisma.localInsight.findMany).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('缓存的内容');
      expect(chunkRetrieval.retrieve).not.toHaveBeenCalled();
    });

    it('应该在缓存过期时重新生成', async () => {
      const fortyDaysAgo = new Date();
      fortyDaysAgo.setDate(fortyDaysAgo.getDate() - 40); // 40 天前，超过 30 天缓存期

      const mockOldCached = [
        {
          id: '1',
          countryCode: 'IS',
          region: null,
          tags: ['culture'],
          content: '旧内容',
          evidenceSnippets: [],
          confidence: 'MEDIUM',
          source: null,
          lastUpdated: fortyDaysAgo,
        },
      ];

      const mockChunkRows = [
        {
          id: '1',
          chunkId: 'c1',
          content: '新的 RAG 内容',
          type: 'text',
          credibilityScore: 0.8,
          keywords: [] as string[],
          metadata: { title: 'New Content' },
          fileId: 'f1',
          similarity: 0.8,
          sourceFile: 'doc.md',
        },
      ];

      const mockGeneratedInsights = [
        {
          content: '新生成的洞察',
          evidenceSnippets: ['证据1'],
          confidence: 'HIGH' as const,
        },
      ];

      const mockSaved = {
        id: '2',
        countryCode: 'IS',
        region: null,
        tags: ['culture'],
        content: '新生成的洞察',
        evidenceSnippets: ['证据1'],
        confidence: 'HIGH',
        source: null,
        lastUpdated: new Date(),
      };

      // @ts-ignore
      prisma.localInsight.findMany.mockResolvedValue(mockOldCached);
      chunkRetrieval.retrieve.mockResolvedValue(mockChunkRows as any);
      llmExtraction.extractStructured.mockResolvedValue(mockGeneratedInsights);
      // @ts-ignore
      prisma.localInsight.create.mockResolvedValue(mockSaved);

      const result = await service.getLocalInsight('IS', ['culture']);

      expect(chunkRetrieval.retrieve).toHaveBeenCalled();
      expect(llmExtraction.extractStructured).toHaveBeenCalled();
      expect(prisma.localInsight.create).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].content).toBe('新生成的洞察');
    });

    it('应该在未找到 RAG 内容时返回空数组', async () => {
      const fortyDaysAgo = new Date();
      fortyDaysAgo.setDate(fortyDaysAgo.getDate() - 40);

      // @ts-ignore
      prisma.localInsight.findMany.mockResolvedValue([
        {
          id: '1',
          countryCode: 'IS',
          lastUpdated: fortyDaysAgo,
        },
      ]);
      chunkRetrieval.retrieve.mockResolvedValue([]);

      const result = await service.getLocalInsight('IS', ['culture']);

      expect(result).toEqual([]);
      expect(llmExtraction.extractStructured).not.toHaveBeenCalled();
    });

    it('应该支持 region 参数', async () => {
      const fortyDaysAgo = new Date();
      fortyDaysAgo.setDate(fortyDaysAgo.getDate() - 40);

      // @ts-ignore
      prisma.localInsight.findMany.mockResolvedValue([
        {
          id: '1',
          countryCode: 'IS',
          lastUpdated: fortyDaysAgo,
        },
      ]);
      chunkRetrieval.retrieve.mockResolvedValue([]);

      await service.getLocalInsight('IS', ['culture'], 'Reykjavik');

      expect(chunkRetrieval.retrieve).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.stringContaining('Reykjavik'),
        })
      );
    });
  });

  describe('getInsightsByTag', () => {
    it('应该调用 getLocalInsight 并传入单个标签', async () => {
      const spy = jest.spyOn(service, 'getLocalInsight').mockResolvedValue([]);

      await service.getInsightsByTag('IS', 'culture');

      expect(spy).toHaveBeenCalledWith('IS', ['culture'], undefined);
    });
  });

  describe('getInsightsForCountries', () => {
    it('应该批量获取多个国家的洞察', async () => {
      const spy = jest.spyOn(service, 'getLocalInsight').mockResolvedValue([
        {
          countryCode: 'IS',
          tags: ['culture'],
          content: '洞察内容',
          evidenceSnippets: [],
          confidence: 'HIGH',
        },
      ]);

      const result = await service.getInsightsForCountries(['IS', 'FR'], ['culture']);

      expect(spy).toHaveBeenCalledTimes(2);
      expect(result.size).toBe(2);
      expect(result.get('IS')).toHaveLength(1);
      expect(result.get('FR')).toHaveLength(1);
    });

    it('应该处理部分国家获取失败', async () => {
      jest
        .spyOn(service, 'getLocalInsight')
        .mockResolvedValueOnce([
          {
            countryCode: 'IS',
            tags: ['culture'],
            content: '洞察内容',
            evidenceSnippets: [],
            confidence: 'HIGH',
          },
        ])
        .mockRejectedValueOnce(new Error('获取失败'));

      const result = await service.getInsightsForCountries(['IS', 'FR'], ['culture']);

      expect(result.size).toBe(2);
      expect(result.get('IS')).toHaveLength(1);
      expect(result.get('FR')).toEqual([]);
    });
  });

  describe('refreshLocalInsight', () => {
    it('应该删除旧洞察并重新生成', async () => {
      // @ts-ignore
      prisma.localInsight.deleteMany.mockResolvedValue({ count: 2 });
      // refreshLocalInsight 会先删除，然后调用 getLocalInsight
      // getLocalInsight 会先查缓存（此时已删除，所以会查不到），然后 RAG 检索
      // @ts-ignore
      prisma.localInsight.findMany.mockResolvedValue([]); // 缓存为空
      chunkRetrieval.retrieve.mockResolvedValue([
        {
          id: '1',
          chunkId: 'c1',
          content: '新内容',
          type: 'text',
          credibilityScore: 0.8,
          keywords: [] as string[],
          metadata: { title: 'New' },
          fileId: 'f1',
          similarity: 0.8,
          sourceFile: 'doc.md',
        },
      ] as any);
      llmExtraction.extractStructured.mockResolvedValue([
        {
          content: '新洞察',
          evidenceSnippets: ['证据'],
          confidence: 'HIGH' as const,
        },
      ]);
      // @ts-ignore
      prisma.localInsight.create.mockResolvedValue({
        id: '1',
        countryCode: 'IS',
        tags: ['culture'],
        content: '新洞察',
        evidenceSnippets: ['证据'],
        confidence: 'HIGH',
        lastUpdated: new Date(),
      });

      const result = await service.refreshLocalInsight('IS', ['culture']);

      expect(prisma.localInsight.deleteMany).toHaveBeenCalled();
      expect(chunkRetrieval.retrieve).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });
});
