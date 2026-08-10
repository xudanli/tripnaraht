/**
 * Memory Evidence Chain — 每个 Memory 必须能反查来源。
 *
 * Decision → Context Snapshot → Memory Used → Evidence Source
 * → Decision Result → Outcome → Memory Update
 */

export type MemoryEvidenceRefType =
  | 'DECISION_EPISODE'
  | 'USER_EXPLICIT'
  | 'CGUS_TRACE'
  | 'OUTCOME'
  | 'CHAT_TURN'
  | 'WORLD_STATE_SNAPSHOT'
  | 'CONTEXT_SNAPSHOT'
  | 'IMPORT';

export type MemoryEvidenceRefV1 = {
  type: MemoryEvidenceRefType;
  id: string;
  weight?: number;
  note?: string;
  at?: string;
};

/**
 * Prisma Ledger 目标形态（Phase 1）— 与进程内 MemoryEventV1 对齐扩展。
 */
export type DurableMemoryEventShapeV1 = {
  id: string;
  subjectType: string;
  subjectId: string;
  memoryType: string;
  scope: string;
  value: unknown;
  lifecycleStatus: string;
  confidence: number;
  evidenceRefs: MemoryEvidenceRefV1[];
  validTime: { from: string; to: string | null };
  recordedTime: string;
  supersededBy: string | null;
};

/** 单次决策的证据链快照（审计 / Validation Loop） */
export type MemoryEvidenceChainV1 = {
  schemaId: 'tripnara.memory_evidence_chain@v1';
  version: 1;
  decisionId: string;
  contextSnapshotId?: string | null;
  memoryUsed: Array<{
    memoryEventId: string;
    predicate: string;
    value: unknown;
    confidence: number;
    evidenceRefs: MemoryEvidenceRefV1[];
  }>;
  decisionResult?: {
    recommended?: string | null;
    chosen?: string | null;
    userAction?: string | null;
  };
  outcome?: {
    completed?: boolean | null;
    regret?: number | string | null;
  };
  memoryUpdateEventIds?: string[];
};
