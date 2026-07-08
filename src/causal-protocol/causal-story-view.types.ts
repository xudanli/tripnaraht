/**
 * Narrative projection contract (P2) — all personas consume the same trace.
 */

export type CausalStoryChainNodeType =
  | 'WORLD_CHANGE'
  | 'IMPACT'
  | 'CONFLICT'
  | 'OPTION'
  | 'OUTCOME';

export type CausalStoryPersona = 'neutral' | 'abu';

export interface CausalStoryView {
  traceId: string;
  worldStateVersion: string;
  headline: string;
  assessment: string;
  chain: Array<{
    nodeId: string;
    type: CausalStoryChainNodeType;
    title: string;
    description: string;
    sourceRefs?: string[];
  }>;
  recommendedOption?: {
    optionId: string;
    summary: string;
    expectedImprovement: string;
    tradeoff?: string;
  };
  technicalTraceRef: string;
}
