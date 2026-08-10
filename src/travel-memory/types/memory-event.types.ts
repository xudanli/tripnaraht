/**
 * Append-only MemoryEvent（Ledger 事实账本）。
 * 禁止 UPDATE；仅 ADD / CORRECT / INVALIDATE / SUPERSEDE / CONFIRM。
 * 必须带 evidenceRefs，否则 /why 只能靠猜。
 */

import type { MemoryScope, MemorySubject } from './memory-scope.types';
import type { MemoryEvidenceRefV1 } from './memory-evidence-ref.types';
import type { MemoryLifecycleState } from './memory-lifecycle.types';

export const MEMORY_EVENT_SCHEMA = 'tripnara.memory_event@v1' as const;

export type MemoryEventOp =
  | 'ADD'
  | 'CORRECT'
  | 'INVALIDATE'
  | 'SUPERSEDE'
  | 'CONFIRM';

export type MemoryType =
  | 'PREFERENCE'
  | 'CONSTRAINT'
  | 'TRIP_INTENT'
  | 'DECISION_EPISODE_REF'
  | 'OUTCOME_REF'
  | 'PROCEDURAL_CANDIDATE'
  | 'SEMANTIC_EVIDENCE_REF';

export type MemorySourceType =
  | 'USER_EXPLICIT'
  | 'STRONG_INFERENCE'
  | 'WEAK_SIGNAL'
  | 'DECISION_OUTCOME'
  | 'SYSTEM_ATTRIBUTION'
  | 'IMPORT';

export type MemorySource = {
  type: MemorySourceType;
  conversationId?: string;
  turnId?: string;
  decisionId?: string;
  episodeId?: string;
  note?: string;
};

/** 双时态：validTime = 现实何时为真；systemTime = 系统何时知道 */
export type BitemporalTime = {
  validTime: { from: string; to: string | null };
  systemTime: { recordedAt: string };
};

/** CANDIDATE = 归因候选：可进 Ledger，不可进 Profile View */
export type MemoryEventStatus =
  | 'ACTIVE'
  | 'INFERRED'
  | 'CANDIDATE'
  | 'SUPERSEDED'
  | 'INVALIDATED'
  | 'REDACTED';

export type MemoryEventV1 = {
  schemaId: typeof MEMORY_EVENT_SCHEMA;
  version: 1;
  memoryEventId: string;
  op: MemoryEventOp;
  subject: MemorySubject;
  memoryType: MemoryType;
  predicate: string;
  value: unknown;
  scope: MemoryScope;
  source: MemorySource;
  confidence: number;
  status: MemoryEventStatus;
  /** 与 MEMORY_LIFECYCLE 对齐（Prisma 列 lifecycleStatus） */
  lifecycleStatus: MemoryLifecycleState;
  /** 反查来源：Episode / Explicit / Trace … */
  evidenceRefs: MemoryEvidenceRefV1[];
  /** 被本事件替代的旧事件 */
  supersedesEventId?: string | null;
  /** 被谁替代（查询投影；写入时通常为空） */
  supersededBy?: string | null;
  validTime: BitemporalTime['validTime'];
  systemTime: BitemporalTime['systemTime'];
};

export type MemoryFieldView<T = unknown> = {
  key: string;
  value: T;
  confidence: number;
  scope: MemoryScope;
  status: MemoryEventStatus;
  sourceType: MemorySourceType;
  evidenceEventIds: string[];
  validFrom: string;
  validTo: string | null;
  lastConfirmedAt?: string | null;
};
