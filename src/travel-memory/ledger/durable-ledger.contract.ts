/**
 * Durable Ledger 合同（Phase 1 — Memory Validation Loop / Evidence Chain）。
 *
 * 重点不是迁移，而是可反查：这个 Memory 从哪里来的？
 * Memory 最重要的是 Decision Accountability，不是缓存命中率。
 */

export const DURABLE_MEMORY_LEDGER_TABLES = [
  'memory_events',
  'memory_subjects',
  'memory_evidence',
  'memory_versions',
  'memory_candidates',
] as const;

export type DurableMemoryLedgerTable =
  (typeof DURABLE_MEMORY_LEDGER_TABLES)[number];

/** 双时态字段（持久化最小集） */
export type DurableBitemporalColumns = {
  valid_from: string;
  valid_to: string | null;
  recorded_at: string;
  superseded_at: string | null;
};

/**
 * Decision Accountability 查询（Prisma 阶段核心，不是「迁表」）。
 *
 * GET /decision/{id}/explanation  — 为什么这个建议出现？
 * GET /memory/{id}/evidence       — 为什么认为有这个偏好？
 *
 * 兼容别名：
 *   GET /decision/{id}/memory-explanation
 *   GET /memory/user/{id}/why
 */
export type MemoryWhyEvidenceItem = {
  kind: 'EXPLICIT_STATEMENT' | 'ACCEPTED_DECISION' | 'OVERRIDE_AGAINST' | 'OUTCOME';
  at: string;
  tripId?: string;
  episodeId?: string;
  decisionId?: string;
  summary: string;
  weight?: number;
};

export type MemoryWhyResponseV1 = {
  schemaId: 'tripnara.memory_why@v1';
  subjectId: string;
  predicate: string;
  currentValue: unknown;
  confidence: number;
  evidence: MemoryWhyEvidenceItem[];
  bitemporal: DurableBitemporalColumns;
};
