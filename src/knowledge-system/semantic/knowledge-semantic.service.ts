import { Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  toKnowledgeDocumentView,
  type KnowledgeDocumentView,
  type KnowledgeRetrievalTraceView,
} from './build-knowledge-document-view.util';
import {
  assertVectorMustNotHardBlock,
  SEMANTIC_HARD_BLOCK_POLICY,
} from './vector-hard-block.guard.util';

@Injectable()
export class KnowledgeSemanticService implements OnModuleInit {
  private readonly logger = new Logger(KnowledgeSemanticService.name);
  /** In-process retrieval trace ring (Knowledge Center; not a second RAG store) */
  private readonly traces: KnowledgeRetrievalTraceView[] = [];
  private readonly maxTraces = 50;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    this.seedDemoTraces();
    this.logger.log('KnowledgeSemanticService ready (RAG proxy + vector HARD BLOCK ban)');
  }

  /**
   * Thin list over knowledge_files — same corpus as /api/rag/documents.
   */
  async listDocuments(filter?: {
    countryCode?: string;
    collection?: string;
    q?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{
    items: KnowledgeDocumentView[];
    total: number;
    page: number;
    pageSize: number;
    policy: typeof SEMANTIC_HARD_BLOCK_POLICY;
    upstream: string;
  }> {
    assertVectorMustNotHardBlock({
      consumer: 'KnowledgeSemantic.listDocuments',
      proposedRole: 'EVIDENCE_DISCOVERY',
    });

    const page = Math.max(1, filter?.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, filter?.pageSize ?? 20));

    if (!this.prisma.isDbConnected()) {
      return {
        items: this.demoDocuments(),
        total: 2,
        page: 1,
        pageSize,
        policy: SEMANTIC_HARD_BLOCK_POLICY,
        upstream: 'demo (db offline)',
      };
    }

    try {
      const where: Record<string, unknown> = {};
      if (filter?.countryCode) where.countryCode = filter.countryCode.toUpperCase();
      if (filter?.collection) where.category = filter.collection;
      if (filter?.q) {
        where.OR = [
          { filename: { contains: filter.q, mode: 'insensitive' } },
          { filepath: { contains: filter.q, mode: 'insensitive' } },
          { source: { contains: filter.q, mode: 'insensitive' } },
        ];
      }

      const [files, total] = await Promise.all([
        this.prisma.knowledgeFile.findMany({
          where,
          skip: (page - 1) * pageSize,
          take: pageSize,
          orderBy: { updatedAt: 'desc' },
          include: { _count: { select: { chunks: true } } },
        }),
        this.prisma.knowledgeFile.count({ where }),
      ]);

      if (total === 0) {
        return {
          items: this.demoDocuments(),
          total: 2,
          page: 1,
          pageSize,
          policy: SEMANTIC_HARD_BLOCK_POLICY,
          upstream: 'demo (empty corpus)',
        };
      }

      const items = files.map((f) =>
        toKnowledgeDocumentView({
          id: f.id,
          filename: f.filename,
          category: f.category,
          subType: f.subType,
          source: f.source,
          countryCode: f.countryCode,
          dataSources: f.dataSources,
          credibilityScore: f.credibilityScore,
          chunksCount: f._count.chunks,
          updatedAt: f.updatedAt,
        }),
      );

      return {
        items,
        total,
        page,
        pageSize,
        policy: SEMANTIC_HARD_BLOCK_POLICY,
        upstream: '/api/rag/documents (knowledge_files)',
      };
    } catch (e) {
      this.logger.warn(
        `listDocuments fallback to demo: ${e instanceof Error ? e.message : e}`,
      );
      return {
        items: this.demoDocuments(),
        total: 2,
        page: 1,
        pageSize,
        policy: SEMANTIC_HARD_BLOCK_POLICY,
        upstream: 'demo (query error)',
      };
    }
  }

  async getDocument(documentId: string): Promise<KnowledgeDocumentView> {
    assertVectorMustNotHardBlock({
      consumer: 'KnowledgeSemantic.getDocument',
      proposedRole: 'EXPLANATION',
    });

    if (documentId.startsWith('demo-ks-doc-')) {
      const demo = this.demoDocuments().find((d) => d.documentId === documentId);
      if (!demo) throw new NotFoundException(`Document not found: ${documentId}`);
      return demo;
    }

    if (!this.prisma.isDbConnected()) {
      throw new NotFoundException(`Document not found (db offline): ${documentId}`);
    }

    const f = await this.prisma.knowledgeFile.findUnique({
      where: { id: documentId },
      include: { _count: { select: { chunks: true } } },
    });
    if (!f) throw new NotFoundException(`Document not found: ${documentId}`);
    return toKnowledgeDocumentView({
      id: f.id,
      filename: f.filename,
      category: f.category,
      subType: f.subType,
      source: f.source,
      countryCode: f.countryCode,
      dataSources: f.dataSources,
      credibilityScore: f.credibilityScore,
      chunksCount: f._count.chunks,
      updatedAt: f.updatedAt,
    });
  }

  listRetrievalTraces(limit = 20): {
    items: KnowledgeRetrievalTraceView[];
    policy: typeof SEMANTIC_HARD_BLOCK_POLICY;
  } {
    assertVectorMustNotHardBlock({
      consumer: 'KnowledgeSemantic.listRetrievalTraces',
      proposedRole: 'EVIDENCE_DISCOVERY',
    });
    return {
      items: this.traces.slice(0, Math.min(50, Math.max(1, limit))),
      policy: SEMANTIC_HARD_BLOCK_POLICY,
    };
  }

  recordRetrievalTrace(
    partial: Omit<KnowledgeRetrievalTraceView, 'hardBlockEligible' | 'note' | 'usedFor'> & {
      usedFor?: KnowledgeRetrievalTraceView['usedFor'];
    },
  ): KnowledgeRetrievalTraceView {
    const row: KnowledgeRetrievalTraceView = {
      ...partial,
      usedFor: partial.usedFor ?? 'EVIDENCE_DISCOVERY',
      hardBlockEligible: false,
      note: SEMANTIC_HARD_BLOCK_POLICY.note,
    };
    // Refuse if caller tried to smuggle hard block
    assertVectorMustNotHardBlock({
      consumer: 'KnowledgeSemantic.recordRetrievalTrace',
      hardBlockFromVector: false,
    });
    this.traces.unshift(row);
    if (this.traces.length > this.maxTraces) this.traces.length = this.maxTraces;
    return row;
  }

  coverageStats(): {
    semanticProxyReady: boolean;
    documentSampleCount: number | null;
    retrievalTraceCount: number;
    vectorHardBlockBanned: true;
  } {
    return {
      semanticProxyReady: true,
      documentSampleCount: null,
      retrievalTraceCount: this.traces.length,
      vectorHardBlockBanned: true,
    };
  }

  private demoDocuments(): KnowledgeDocumentView[] {
    return [
      toKnowledgeDocumentView({
        id: 'demo-ks-doc-road-is',
        filename: 'IS Road.is highland FAQ (demo)',
        category: 'risks',
        subType: 'road_status',
        source: 'Road.is',
        countryCode: 'IS',
        dataSources: ['official', 'faq'],
        credibilityScore: 0.9,
        chunksCount: 3,
        withEmbedding: 3,
        lastVerifiedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        contentPreview: 'F-roads may close; RAG explains — Gate uses World Snapshot.',
      }),
      toKnowledgeDocumentView({
        id: 'demo-ks-doc-safetravel',
        filename: 'SafeTravel weather advisory (demo)',
        category: 'practical',
        subType: 'safety',
        source: 'SafeTravel.is',
        countryCode: 'IS',
        dataSources: ['official'],
        credibilityScore: 0.85,
        chunksCount: 2,
        withEmbedding: 1,
        updatedAt: new Date().toISOString(),
        contentPreview: 'Semantic retrieval for explanation only.',
      }),
    ];
  }

  private seedDemoTraces(): void {
    this.recordRetrievalTrace({
      traceId: 'ks-trace-demo-1',
      requestId: 'demo-ks-phase6',
      queriedAt: new Date().toISOString(),
      queryPreview: 'Is F208 open for 2WD?',
      countryCode: 'IS',
      hitCount: 2,
      topSources: ['Road.is', 'SafeTravel.is'],
      usedFor: 'EXPLANATION',
    });
  }
}
