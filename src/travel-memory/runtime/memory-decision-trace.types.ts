/**
 * Memory Decision Trace — 扩展 Decision Trace：Memory 到底有没有影响决策？
 *
 * 防止：Memory 存了很多，但 Decision 根本没用。
 */

import type { MemoryEvidenceRefV1 } from '../types/memory-evidence-ref.types';

export type MemoryContributionItemV1 = {
  /** @deprecated 使用 memoryId；保留 id 兼容 */
  id: string;
  memoryId: string;
  influence:
    | 'PACE_CONSTRAINT'
    | 'TRIP_OVERRIDE'
    | 'MEMBER_CONSTRAINT'
    | 'RISK_PREFERENCE'
    | 'EPISODE_WARNING'
    | 'OTHER';
  /** 对本次推荐的可证明影响权重 */
  weight: number;
  confidence: number;
  evidenceRefs?: MemoryEvidenceRefV1[];
};

export type MemoryDecisionTraceV1 = {
  schemaId: 'tripnara.memory_decision_trace@v1';
  version: 1;
  decisionId: string;
  contextSources: {
    world: boolean;
    booking: boolean;
    team: boolean;
    memory: boolean;
  };
  memoryContribution: {
    used: boolean;
    /** 可证明影响列表；used=true 时不得为空（防假提升） */
    influence: MemoryContributionItemV1[];
    /** @deprecated 使用 influence */
    memories?: MemoryContributionItemV1[];
  };
  outcome?: {
    accepted?: boolean | null;
    regret?: number | null;
    executionSuccess?: boolean | null;
    recoveryCost?: number | null;
  };
};
