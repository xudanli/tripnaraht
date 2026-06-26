/**
 * MemoryState schema v1 — 对齐 memory-model-team SKILL Step 0。
 * 纯类型合同；持久化仍经由 UserProfile.preferences，逐步迁移。
 */

import type { DecisionDnaSignalTier } from '../governance/decision-dna-compliance.types';

export const MEMORY_STATE_SCHEMA_VERSION = 1 as const;

export type MemoryProvenance = {
  source: string;
  signalTier: DecisionDnaSignalTier;
  capturedAt: string;
};

export type MemoryFieldValue<T> = {
  value: T;
  confidence: number;
  provenance: MemoryProvenance;
  updatedAt: string;
  halfLifeDays?: number;
};

export type MemoryStateV1 = {
  schemaVersion: typeof MEMORY_STATE_SCHEMA_VERSION;
  userId: string;
  longTerm: Record<string, MemoryFieldValue<unknown>>;
  session?: Record<string, MemoryFieldValue<unknown>>;
  negativeSignals?: Array<MemoryFieldValue<string>>;
  decisionDnaRef?: {
    confidence: number;
    lastSyncedAt: string;
    dominantAlternative: string | null;
  };
  updatedAt: string;
};

export type DecisionDnaToMemoryPatch = Pick<MemoryStateV1, 'decisionDnaRef' | 'updatedAt'> & {
  longTermPatch?: Record<string, MemoryFieldValue<unknown>>;
};
