/**
 * Week 3 P0：向量粗筛 Entity Resolution。
 *
 * - 默认：EmbeddingService + 进程内余弦索引（POC，无额外基础设施）
 * - 可选：QDRANT_URL 配置时走 Qdrant REST（集合 tripnara_er_entities）
 * - 失败降级：返回 []，由 Redis 子串粗筛兜底
 */

import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingService } from '../../places/services/embedding.service';
import type { EntityCandidate } from '../services/query-rewriting-dictionary.service';
import {
  KNOWLEDGE_GRAPH_DESTINATIONS,
  KNOWLEDGE_GRAPH_POIS,
} from '../data/query-rewriting-knowledge-graph';
import {
  rankVectorIndex,
  type VectorIndexEntry,
} from './vector-entity-index.util';

const QDRANT_COLLECTION = 'tripnara_er_entities';

@Injectable()
export class VectorEntityResolutionProvider implements OnModuleInit {
  private readonly logger = new Logger(VectorEntityResolutionProvider.name);
  private index: VectorIndexEntry[] = [];
  private indexReady = false;
  private readonly scoreThreshold: number;
  private readonly qdrantUrl?: string;

  constructor(
    @Optional() private readonly embeddingService?: EmbeddingService,
    @Optional() private readonly configService?: ConfigService,
  ) {
    this.scoreThreshold = Number(
      this.configService?.get<string>('VECTOR_ER_SCORE_THRESHOLD') ?? 0.55,
    );
    const url = this.configService?.get<string>('QDRANT_URL')?.trim();
    this.qdrantUrl = url || undefined;
  }

  async onModuleInit(): Promise<void> {
    if (this.qdrantUrl) {
      this.logger.log(`向量 ER 启用 Qdrant: ${this.qdrantUrl}`);
      return;
    }
    await this.buildInMemoryIndex();
  }

  /** 向量 Top-N 粗筛（注入 Stage 1 candidateEntities） */
  async searchTopNCandidates(
    query: string,
    limit = 5,
    scoreThreshold = this.scoreThreshold,
  ): Promise<EntityCandidate[]> {
    const q = query.trim();
    if (!q) return [];

    if (this.qdrantUrl && this.embeddingService) {
      try {
        const hits = await this.searchQdrant(q, limit, scoreThreshold);
        if (hits.length) return hits;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Qdrant 向量粗筛失败，降级内存索引: ${msg}`);
      }
    }

    if (!this.embeddingService) return [];

    if (!this.indexReady) {
      await this.buildInMemoryIndex();
    }
    if (!this.index.length) return [];

    try {
      const queryVector = await this.embeddingService.generateEmbedding(q);
      return rankVectorIndex(this.index, queryVector, limit, scoreThreshold);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`向量粗筛 embedding 失败: ${msg}`);
      return [];
    }
  }

  private async buildInMemoryIndex(): Promise<void> {
    if (!this.embeddingService) {
      this.logger.warn('EmbeddingService 未注入，向量 ER 索引跳过');
      return;
    }

    const labels: Array<{ label: string; kind: 'destination' | 'poi' }> = [
      ...KNOWLEDGE_GRAPH_DESTINATIONS.map((label) => ({
        label,
        kind: 'destination' as const,
      })),
      ...KNOWLEDGE_GRAPH_POIS.map((label) => ({
        label,
        kind: 'poi' as const,
      })),
    ];

    const unique = new Map<string, 'destination' | 'poi'>();
    for (const item of labels) {
      if (!unique.has(item.label)) unique.set(item.label, item.kind);
    }

    const entries: VectorIndexEntry[] = [];
    for (const [label, kind] of unique.entries()) {
      try {
        const embedding = await this.embeddingService.generateEmbedding(label);
        if (embedding.some((v) => v !== 0)) {
          entries.push({ label, kind, embedding });
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.debug(`索引 embedding 跳过 ${label}: ${msg}`);
      }
    }

    this.index = entries;
    this.indexReady = entries.length > 0;
    this.logger.log(`向量 ER 内存索引就绪: entries=${entries.length}`);
  }

  private async searchQdrant(
    query: string,
    limit: number,
    scoreThreshold: number,
  ): Promise<EntityCandidate[]> {
    const vector = await this.embeddingService!.generateEmbedding(query);
    const base = this.qdrantUrl!.replace(/\/$/, '');
    const res = await fetch(`${base}/collections/${QDRANT_COLLECTION}/points/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vector,
        limit,
        score_threshold: scoreThreshold,
        with_payload: true,
      }),
    });

    if (!res.ok) {
      throw new Error(`Qdrant search HTTP ${res.status}`);
    }

    const body = (await res.json()) as {
      result?: Array<{
        score?: number;
        payload?: { standard_name?: string; kind?: string };
      }>;
    };

    return (body.result ?? [])
      .map((hit) => ({
        label: String(hit.payload?.standard_name ?? '').trim(),
        kind: (hit.payload?.kind === 'poi' ? 'poi' : 'destination') as 'destination' | 'poi',
        score: hit.score ?? 0,
      }))
      .filter((x) => x.label.length > 0);
  }
}
