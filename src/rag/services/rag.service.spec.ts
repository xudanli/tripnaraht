// src/rag/services/rag.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { RagService } from './rag.service';
import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from '../../places/services/embedding.service';
import { IndexingService } from '../../knowledge-base/services/indexing.service';
import { RagRetrievalParams, DocumentIndexItem } from '../interfaces/rag.interface';

describe('RagService', () => {
  let service: RagService;
  let prisma: jest.Mocked<PrismaService>;
  let embeddingService: jest.Mocked<EmbeddingService>;
  let indexingService: jest.Mocked<Pick<IndexingService, 'replaceChunksForFile'>>;

  const mockEmbedding = new Array(1536).fill(0.1);

  beforeEach(async () => {
    const mockPrisma = {
      $queryRaw: jest.fn(),
      $queryRawUnsafe: jest.fn(),
      $executeRaw: jest.fn(),
      knowledgeFile: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };

    const mockEmbeddingService = {
      generateEmbedding: jest.fn().mockResolvedValue(mockEmbedding),
      getEmbeddingDimension: jest.fn().mockReturnValue(1536),
    };

    const mockIndexing = {
      replaceChunksForFile: jest.fn().mockResolvedValue(undefined),
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
        {
          provide: IndexingService,
          useValue: mockIndexing,
        },
      ],
    }).compile();

    service = module.get<RagService>(RagService);
    prisma = module.get(PrismaService);
    embeddingService = module.get(EmbeddingService);
    indexingService = module.get(IndexingService);
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

    // 模拟“document_index 表已删除”的运行时行为。
      prisma.$queryRaw.mockRejectedValue(new Error('relation "document_index" does not exist'));

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
    it('记录不存在时抛错', async () => {
      prisma.knowledgeFile.findUnique.mockResolvedValueOnce(null);
      await expect(service.deleteDocument('missing')).rejects.toThrow('文档不存在');
      expect(prisma.knowledgeFile.delete).not.toHaveBeenCalled();
    });

    it('存在时删除 knowledge_files 行', async () => {
      prisma.knowledgeFile.findUnique.mockResolvedValueOnce({ id: 'doc-id' });
      prisma.knowledgeFile.delete.mockResolvedValueOnce({} as never);

      await service.deleteDocument('doc-id');

      expect(prisma.knowledgeFile.delete).toHaveBeenCalledWith({
        where: { id: 'doc-id' },
      });
    });
  });

  describe('updateDocument', () => {
    const baseFile = {
      id: 'doc-id',
      filename: 'old.json',
      filepath: 'old.json',
      category: 'travel_guides',
      version: '1.0',
      language: 'zh-CN',
      credibilityScore: 0.8,
      dataSources: [] as string[],
      countryCode: null as string | null,
      source: null as string | null,
      adminMetadata: null,
      lastUpdated: new Date('2026-01-01T00:00:00.000Z'),
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    it('记录不存在时抛错', async () => {
      prisma.knowledgeFile.findUnique.mockResolvedValueOnce(null);
      await expect(
        service.updateDocument('missing', { title: 'x' }),
      ).rejects.toThrow('文档不存在');
    });

    it('仅更新元数据时不调用 replaceChunksForFile', async () => {
      prisma.knowledgeFile.findUnique.mockResolvedValue({ ...baseFile });
      prisma.knowledgeFile.findFirst.mockResolvedValue(null);
      prisma.knowledgeFile.update.mockResolvedValue({
        ...baseFile,
        dataSources: ['new-tag'],
      });

      await service.updateDocument('doc-id', { tags: ['new-tag'] });

      expect(indexingService.replaceChunksForFile).not.toHaveBeenCalled();
      expect(prisma.knowledgeFile.update).toHaveBeenCalled();
    });

    it('包含 content 时重建 chunks', async () => {
      prisma.knowledgeFile.findUnique.mockResolvedValue({ ...baseFile });
      prisma.knowledgeFile.findFirst.mockResolvedValue(null);
      prisma.knowledgeFile.update.mockResolvedValue({ ...baseFile });

      await service.updateDocument('doc-id', { content: '{"k":1}' });

      expect(indexingService.replaceChunksForFile).toHaveBeenCalled();
    });
  });
});
