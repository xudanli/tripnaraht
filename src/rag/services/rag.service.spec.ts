// src/rag/services/rag.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { RagService } from './rag.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from '../../places/services/embedding.service';
import { RagRetrievalParams, DocumentIndexItem } from '../interfaces/rag.interface';
import { Prisma } from '@prisma/client';

describe('RagService', () => {
  let service: RagService;
  let prisma: jest.Mocked<PrismaService>;
  let embeddingService: jest.Mocked<EmbeddingService>;

  const mockEmbedding = new Array(1536).fill(0.1);

  beforeEach(async () => {
    const mockPrisma = {
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn(),
      documentIndex: {
        findMany: jest.fn(),
        delete: jest.fn(),
        update: jest.fn(),
      },
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

    it('应该在向量搜索失败时降级到关键词搜索', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('向量搜索失败'));
      prisma.documentIndex.findMany.mockResolvedValue([
        {
          id: '1',
          title: '测试文档1',
          content: '这是测试内容1',
          source: 'test-source-1',
          countryCode: null,
          tags: [],
          metadata: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as any);

      const params: RagRetrievalParams = {
        query: '测试查询',
        collection: 'travel_guides',
        limit: 10,
      };

      const results = await service.retrieve(params);

      expect(prisma.documentIndex.findMany).toHaveBeenCalled();
      expect(results).toHaveLength(1);
      expect(results[0].score).toBe(0.5); // 关键词搜索默认分数
    });

    it('应该处理 embedding 生成失败', async () => {
      embeddingService.generateEmbedding.mockRejectedValue(new Error('Embedding 生成失败'));
      prisma.documentIndex.findMany.mockResolvedValue([]);

      const params: RagRetrievalParams = {
        query: '测试查询',
        collection: 'travel_guides',
        limit: 10,
      };

      const results = await service.retrieve(params);

      expect(prisma.documentIndex.findMany).toHaveBeenCalled();
      expect(results).toEqual([]);
    });
  });

  describe('indexDocument', () => {
    it('应该成功索引文档', async () => {
      const mockResult = [{ id: 'new-doc-id' }];
      prisma.$queryRaw.mockResolvedValue(mockResult);

      const item: DocumentIndexItem = {
        collection: 'travel_guides',
        title: '测试文档',
        content: '这是测试内容',
        source: 'test-source',
        countryCode: 'IS',
        tags: ['iceland'],
        metadata: { test: true },
      };

      const id = await service.indexDocument(item);

      expect(embeddingService.generateEmbedding).toHaveBeenCalledWith('测试文档\n\n这是测试内容');
      expect(prisma.$queryRaw).toHaveBeenCalled();
      expect(id).toBe('new-doc-id');
    });

    it('应该处理索引失败', async () => {
      prisma.$queryRaw.mockRejectedValue(new Error('索引失败'));

      const item: DocumentIndexItem = {
        collection: 'travel_guides',
        title: '测试文档',
        content: '这是测试内容',
      };

      await expect(service.indexDocument(item)).rejects.toThrow('索引失败');
    });
  });

  describe('indexDocuments', () => {
    it('应该批量索引文档', async () => {
      const mockResults = [
        [{ id: 'doc-1' }],
        [{ id: 'doc-2' }],
      ];
      prisma.$queryRaw
        .mockResolvedValueOnce(mockResults[0])
        .mockResolvedValueOnce(mockResults[1]);

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

      const ids = await service.indexDocuments(items);

      expect(ids).toHaveLength(2);
      expect(ids).toEqual(['doc-1', 'doc-2']);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(2);
    });

    it('应该处理部分文档索引失败', async () => {
      prisma.$queryRaw
        .mockResolvedValueOnce([{ id: 'doc-1' }])
        .mockRejectedValueOnce(new Error('索引失败'));

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

      const ids = await service.indexDocuments(items);

      // 应该返回成功索引的文档 ID
      expect(ids).toHaveLength(1);
      expect(ids[0]).toBe('doc-1');
    });
  });

  describe('deleteDocument', () => {
    it('应该成功删除文档', async () => {
      prisma.documentIndex.delete.mockResolvedValue({} as any);

      await service.deleteDocument('doc-id');

      expect(prisma.documentIndex.delete).toHaveBeenCalledWith({
        where: { id: 'doc-id' },
      });
    });
  });

  describe('updateDocument', () => {
    it('应该成功更新文档（不更新内容）', async () => {
      prisma.documentIndex.update.mockResolvedValue({} as any);

      await service.updateDocument('doc-id', {
        title: '新标题',
        tags: ['new-tag'],
      });

      expect(prisma.documentIndex.update).toHaveBeenCalledWith({
        where: { id: 'doc-id' },
        data: expect.objectContaining({
          title: '新标题',
          tags: ['new-tag'],
        }),
      });
    });

    it('应该在更新内容时重新生成 embedding', async () => {
      const mockResult = {};
      prisma.$executeRaw.mockResolvedValue(mockResult);

      await service.updateDocument('doc-id', {
        title: '新标题',
        content: '新内容',
      });

      expect(embeddingService.generateEmbedding).toHaveBeenCalledWith('新标题\n\n新内容');
      expect(prisma.$executeRaw).toHaveBeenCalled();
    });
  });
});
