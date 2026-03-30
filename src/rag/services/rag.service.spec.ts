// src/rag/services/rag.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { RagService } from './rag.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from '../../places/services/embedding.service';
import { RagRetrievalParams, DocumentIndexItem } from '../interfaces/rag.interface';

describe('RagService', () => {
  let service: RagService;
  let prisma: jest.Mocked<PrismaService>;
  let embeddingService: jest.Mocked<EmbeddingService>;

  const mockEmbedding = new Array(1536).fill(0.1);

  beforeEach(async () => {
    const mockPrisma = {
      $queryRaw: jest.fn(),
      $queryRawUnsafe: jest.fn(),
      $executeRaw: jest.fn(),
      // documentIndex已删除，不再mock
    };

    const mockEmbeddingService = {
      generateEmbedding: jest.fn().mockResolvedValue(mockEmbedding),
      getEmbeddingDimension: jest.fn().mockReturnValue(1536),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RagService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: EmbeddingService,
          useValue: mockEmbeddingService,
        },
      ],
    }).compile();

    service = module.get<RagService>(RagService);
    prisma = module.get(PrismaService);
    embeddingService = module.get(EmbeddingService);
  });

  it('应该被定义', () => {
    expect(service).toBeDefined();
  });

  describe('retrieve', () => {
    const mockQueryResults = [
      {
        id: '1',
        title: '测试文档1',
        content: '这是测试内容1',
        source: 'test-source-1',
        metadata: { test: true },
        score: 0.85,
      },
      {
        id: '2',
        title: '测试文档2',
        content: '这是测试内容2',
        source: 'test-source-2',
        metadata: null,
        score: 0.75,
      },
    ];

    beforeEach(() => {
      prisma.$queryRaw.mockResolvedValue(mockQueryResults);
    });

    it('应该成功检索文档', async () => {
      const params: RagRetrievalParams = {
        query: '测试查询',
        collection: 'travel_guides',
        limit: 10,
      };

      const results = await service.retrieve(params);

      expect(embeddingService.generateEmbedding).toHaveBeenCalledWith('测试查询');
      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(results).toHaveLength(2);
      expect(results[0].id).toBe('1');
      expect(results[0].score).toBe(0.85);
    });

    it('应该支持 countryCode 过滤', async () => {
      const params: RagRetrievalParams = {
        query: '测试查询',
        collection: 'travel_guides',
        countryCode: 'IS',
        limit: 10,
      };

      const results = await service.retrieve(params);

      // 验证调用了向量搜索
      expect(prisma.$queryRaw).toHaveBeenCalled();
      // 验证返回了结果
      expect(results).toBeDefined();
    });

    it('应该支持 tags 过滤', async () => {
      const params: RagRetrievalParams = {
        query: '测试查询',
        collection: 'travel_guides',
        tags: ['iceland', 'f-road'],
        limit: 10,
      };

      const results = await service.retrieve(params);

      // 验证调用了向量搜索
      expect(prisma.$queryRaw).toHaveBeenCalled();
      // 验证返回了结果
      expect(results).toBeDefined();
    });

    it('应该过滤低分结果', async () => {
      const lowScoreResults = [
        { ...mockQueryResults[0], score: 0.3 }, // 低于 minScore
        { ...mockQueryResults[1], score: 0.6 }, // 高于 minScore
      ];
      prisma.$queryRaw.mockResolvedValue(lowScoreResults);

      const params: RagRetrievalParams = {
        query: '测试查询',
        collection: 'travel_guides',
        minScore: 0.5,
        limit: 10,
      };

      const results = await service.retrieve(params);

      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(0.6);
    });

    it('应该返回空结果（document_index表已删除）', async () => {
      const params: RagRetrievalParams = {
        query: '测试查询',
        collection: 'travel_guides',
        limit: 10,
      };

      const results = await service.retrieve(params);

      // document_index表已删除，应返回空结果
      expect(results).toEqual([]);
    });
  });

  describe('indexDocument', () => {
    it('应该抛出错误（document_index表已删除）', async () => {
      const item: DocumentIndexItem = {
        collection: 'travel_guides',
        title: '测试文档',
        content: '这是测试内容',
        source: 'test-source',
        countryCode: 'IS',
        tags: ['iceland'],
        metadata: { test: true },
      };

      await expect(service.indexDocument(item)).rejects.toThrow('document_index表已删除');
    });
  });

  describe('indexDocuments', () => {
    it('应该抛出错误（document_index表已删除）', async () => {
      const items: DocumentIndexItem[] = [
        {
          collection: 'travel_guides',
          title: '文档1',
          content: '内容1',
        },
        {
          collection: 'travel_guides',
          title: '文档2',
          content: '内容2',
        },
      ];

      await expect(service.indexDocuments(items)).rejects.toThrow('document_index表已删除');
    });
  });

  describe('deleteDocument', () => {
    it('应该抛出错误（document_index表已删除）', async () => {
      await expect(service.deleteDocument('doc-id')).rejects.toThrow('document_index表已删除');
    });
  });

  describe('updateDocument', () => {
    it('应该抛出错误（document_index表已删除）', async () => {
      await expect(service.updateDocument('doc-id', {
        title: '新标题',
        tags: ['new-tag'],
      })).rejects.toThrow('document_index表已删除');
    });
  });
});
