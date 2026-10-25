/**
 * Knowledge Control Center view of Semantic documents (RAG proxy shape).
 */

import { SEMANTIC_HARD_BLOCK_POLICY } from './vector-hard-block.guard.util';

export type KnowledgeDocFreshness = 'VERIFIED' | 'STALE' | 'UNKNOWN';

export type KnowledgeDocumentView = {
  documentId: string;
  title: string;
  source: string | null;
  countryCode: string | null;
  collection: string;
  subType: string | null;
  type: string;
  freshness: KnowledgeDocFreshness;
  embeddingStatus: 'INDEXED' | 'PARTIAL' | 'NONE' | 'UNKNOWN';
  chunksCount: number;
  credibilityScore: number | null;
  tags: string[];
  updatedAt: string;
  /** Permanent — never true */
  hardBlockEligible: false;
  vectorRole: typeof SEMANTIC_HARD_BLOCK_POLICY.vectorRole;
  contentPreview?: string;
};

export type KnowledgeRetrievalTraceView = {
  traceId: string;
  requestId: string;
  queriedAt: string;
  queryPreview: string;
  countryCode: string | null;
  hitCount: number;
  topSources: string[];
  usedFor: 'EXPLANATION' | 'EVIDENCE_DISCOVERY' | 'SOFT_HINT';
  /** Permanent — never true */
  hardBlockEligible: false;
  note: string;
};

export function freshnessFromFile(input: {
  lastVerifiedAt?: Date | string | null;
  credibilityScore?: number | null;
  updatedAt?: Date | string;
}): KnowledgeDocFreshness {
  if (input.lastVerifiedAt) {
    const t = new Date(input.lastVerifiedAt).getTime();
    if (Number.isFinite(t) && Date.now() - t < 90 * 24 * 60 * 60 * 1000) {
      return 'VERIFIED';
    }
    return 'STALE';
  }
  if (input.credibilityScore != null && input.credibilityScore >= 0.75) return 'VERIFIED';
  if (input.credibilityScore != null && input.credibilityScore < 0.4) return 'STALE';
  return 'UNKNOWN';
}

export function embeddingStatusFromCounts(chunksCount: number, withEmbedding?: number): KnowledgeDocumentView['embeddingStatus'] {
  if (chunksCount <= 0) return 'NONE';
  if (withEmbedding == null) return 'UNKNOWN';
  if (withEmbedding <= 0) return 'NONE';
  if (withEmbedding < chunksCount) return 'PARTIAL';
  return 'INDEXED';
}

export function toKnowledgeDocumentView(input: {
  id: string;
  filename: string;
  category: string;
  subType?: string | null;
  source?: string | null;
  countryCode?: string | null;
  dataSources?: string[];
  credibilityScore?: number | null;
  chunksCount: number;
  withEmbedding?: number;
  lastVerifiedAt?: Date | string | null;
  updatedAt: Date | string;
  contentPreview?: string;
}): KnowledgeDocumentView {
  return {
    documentId: input.id,
    title: input.filename,
    source: input.source ?? null,
    countryCode: input.countryCode ?? null,
    collection: input.category,
    subType: input.subType ?? null,
    type: input.subType || input.category,
    freshness: freshnessFromFile(input),
    embeddingStatus: embeddingStatusFromCounts(input.chunksCount, input.withEmbedding),
    chunksCount: input.chunksCount,
    credibilityScore: input.credibilityScore ?? null,
    tags: input.dataSources ?? [],
    updatedAt:
      input.updatedAt instanceof Date
        ? input.updatedAt.toISOString()
        : String(input.updatedAt),
    hardBlockEligible: false,
    vectorRole: SEMANTIC_HARD_BLOCK_POLICY.vectorRole,
    contentPreview: input.contentPreview,
  };
}
