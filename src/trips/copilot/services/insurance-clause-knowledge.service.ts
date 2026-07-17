/**
 * Insurance clause knowledge for Copilot — EXPLANATORY only.
 * RAG may supplement clause notes; never decides coverageTier (trip context does).
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ChunkRetrievalService } from '../../../rag/services/chunk-retrieval.service';

const STRUCTURED_CLAUSE_FALLBACK = [
  '砂石险（GP）与火山灰险需按路段核对是否有效。',
  '涉水 / 河滩穿越通常为除外责任，各档普通险均不覆盖。',
  '核对 CDW 起赔额、开门损与底盘是否在基础套餐外。',
];

export interface InsuranceClauseKnowledge {
  /** Short notes for advisor prompt (not tier recommendation). */
  clauseNotes: string[];
  source: 'RAG' | 'STRUCTURED_FALLBACK' | 'NONE';
}

@Injectable()
export class InsuranceClauseKnowledgeService {
  private readonly logger = new Logger(InsuranceClauseKnowledgeService.name);

  constructor(@Optional() private readonly chunks?: ChunkRetrievalService) {}

  /**
   * Retrieve clause knowledge. Failures / empty RAG → structured fallback.
   * Never returns a recommended tier.
   */
  async fetchClauseNotes(opts?: {
    locale?: string;
    timeoutMs?: number;
  }): Promise<InsuranceClauseKnowledge> {
    const timeoutMs = opts?.timeoutMs ?? 1500;
    if (!this.chunks) {
      return {
        clauseNotes: STRUCTURED_CLAUSE_FALLBACK,
        source: 'STRUCTURED_FALLBACK',
      };
    }

    try {
      const query =
        '冰岛租车保险 CDW SCDW 碎石险 gravel protection 涉水除外 起赔额 开门损';
      const retrievePromise = this.chunks.retrieve({
        query,
        limit: 4,
        useHybridSearch: true,
        useIntentClassification: true,
      });
      const results = await Promise.race([
        retrievePromise,
        new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
      ]);

      if (!results?.length) {
        return {
          clauseNotes: STRUCTURED_CLAUSE_FALLBACK,
          source: 'STRUCTURED_FALLBACK',
        };
      }

      const notes = results
        .map((r) => (r.content || '').replace(/\s+/g, ' ').trim())
        .filter((s) => s.length >= 12)
        .map((s) => (s.length > 80 ? `${s.slice(0, 80)}…` : s))
        .slice(0, 3);

      if (!notes.length) {
        return {
          clauseNotes: STRUCTURED_CLAUSE_FALLBACK,
          source: 'STRUCTURED_FALLBACK',
        };
      }

      return { clauseNotes: notes, source: 'RAG' };
    } catch (err) {
      this.logger.debug(
        `insurance RAG skipped: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        clauseNotes: STRUCTURED_CLAUSE_FALLBACK,
        source: 'STRUCTURED_FALLBACK',
      };
    }
  }
}
