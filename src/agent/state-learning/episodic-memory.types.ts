/**
 * Episodic Memory（State & Learning）— Decision / Plan Change / Live Risk 三类。
 * 原则：Memory ≠ Truth；仅作 Context，不得绕过 Evidence / Gate / Verify。
 */

export const TRAVEL_EPISODIC_MEMORY_SCHEMA = 'nara.travel_episodic_memory@v1' as const;

export type TravelEpisodicKind =
  | 'DECISION_EPISODE'
  | 'PLAN_CHANGE_EPISODE'
  | 'LIVE_RISK_EPISODE';

/** 使用策略：永远 CONTEXT_ONLY */
export type TravelEpisodicUsagePolicy = 'CONTEXT_ONLY';

export type TravelEpisodicMemoryV1 = {
  schemaId: typeof TRAVEL_EPISODIC_MEMORY_SCHEMA;
  version: 1;
  episodeId: string;
  kind: TravelEpisodicKind;
  tripId: string;
  createdAt: string;
  summaryZh: string;
  /** Ledger 关联 */
  sourceEventIds: string[];
  correlation: {
    decisionId?: string | null;
    planVersionFrom?: number | null;
    planVersionTo?: number | null;
    actionId?: string | null;
    turnId?: string | null;
    riskEventId?: string | null;
  };
  usagePolicy: TravelEpisodicUsagePolicy;
  /** 显式：不可作为事实依据 */
  isTruth: false;
};
