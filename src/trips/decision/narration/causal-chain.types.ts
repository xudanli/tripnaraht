/**
 * Causal Chain — Decision Kernel trace 的可叙事因果链节点（SSOT，LLM 仅润色措辞）。
 */

import type { DecisionPersona } from '../shared/decision-result.types';

export const CAUSAL_CHAIN_SCHEMA_V1 = 'causal-chain/v1' as const;

export type CausalNodeKind =
  | 'WEATHER_PERTURBATION'
  | 'ROAD_CLOSURE'
  | 'TIME_DRIFT'
  | 'DEM_HARD_GATE'
  | 'PERSONA_REPAIR'
  | 'MONTE_CARLO_OUTCOME'
  | 'SCHEDULE_ADJUSTMENT'
  | 'SYSTEM_DEGRADATION';

export interface CausalChainNode {
  id: string;
  kind: CausalNodeKind;
  order: number;
  facts: Record<string, string | number | boolean>;
  persona?: DecisionPersona;
  sourceRef?: string;
}

export interface CausalChain {
  schemaVersion: typeof CAUSAL_CHAIN_SCHEMA_V1;
  protectionHeadlineZh: string;
  nodes: CausalChainNode[];
  monteCarloSampleCount?: number;
  chosenPlanId?: string;
}

export interface CausalNarrativeCompileResult {
  structuredContextJson: string;
  deterministicSummaryZh: string;
  chain: CausalChain;
}
