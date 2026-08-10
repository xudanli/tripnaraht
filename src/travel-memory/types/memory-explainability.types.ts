/**
 * Memory Context Explainability — 支撑「为什么你觉得我不适合这个？」
 * 供 Decision Trace 引用。
 */

/** 可解释投影用证据引用（≠ Ledger Evidence Chain 的 MemoryEvidenceRefV1） */
export type ExplainableEvidenceRefV1 = {
  type: 'EXPLICIT' | 'EPISODE' | 'OUTCOME' | 'TRIP_OVERRIDE' | 'WORLD_STATE';
  date?: string;
  count?: number;
  episodeId?: string;
  decisionId?: string;
  summary?: string;
};

export type ExplainedPreferenceV1 = {
  preference: string;
  value: unknown;
  confidence: number;
  lifecycle: 'ACTIVE';
  evidence: ExplainableEvidenceRefV1[];
};

export type ExplainedFactV1 = {
  key: string;
  value: unknown;
  source: 'TRIP' | 'WORLD' | 'WORKING' | 'HARD_CONSTRAINT';
};

export type ExplainedEpisodeV1 = {
  episodeId: string;
  decisionType: string;
  summary: string;
  regret?: number | string | null;
  decisionId?: string | null;
};

export type ExplainedConflictV1 = {
  predicate: string;
  winnerLevel: string;
  winnerValue: unknown;
  ignoredLevel?: string;
  ignoredValue?: unknown;
  reason: string;
};

/**
 * buildContext 可解释投影（Decision Context 只含 ACTIVE）。
 */
export type MemoryExplainableContextV1 = {
  facts: ExplainedFactV1[];
  preferences: ExplainedPreferenceV1[];
  episodes: ExplainedEpisodeV1[];
  confidence: Array<{ key: string; confidence: number }>;
  evidence: ExplainableEvidenceRefV1[];
  conflicts: ExplainedConflictV1[];
};
