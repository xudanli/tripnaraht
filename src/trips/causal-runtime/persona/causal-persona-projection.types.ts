/**
 * P3 — Shared causal kernel projection for Abu / Dr.Dre / Neptune expression layer.
 */

import type { TripIntervention } from '../trip-intervention.types';

export const CAUSAL_PERSONA_PROJECTION_SCHEMA = 'tripnara/causal-persona-projection/v1' as const;

export type CausalPersonaName = 'ABU' | 'DR_DRE' | 'NEPTUNE';

export interface CausalPersonaSlice {
  persona: CausalPersonaName;
  verdict: 'ALLOW' | 'ADJUST' | 'REPLACE' | 'REJECT' | 'NEED_CONFIRM';
  explanation: string;
  causalChain: string[];
  evidence: Array<{
    source: string;
    excerpt: string;
    relevance: string;
  }>;
  recommendations?: Array<{
    action: string;
    reason: string;
    impact: string;
  }>;
  intervention?: TripIntervention;
  source:
    | 'decision_kernel'
    | 'iceland_causal_module'
    | 'strategy_orchestrator'
    | 'repair_evaluation';
}

export interface CausalPersonaProjection {
  schema: typeof CAUSAL_PERSONA_PROJECTION_SCHEMA;
  causality_id?: string;
  abu?: CausalPersonaSlice;
  drdre?: CausalPersonaSlice;
  neptune?: CausalPersonaSlice;
  consolidatedSummary?: string;
  userFacingAssessment?: string;
  /** When true, Agent layer must not run parallel LLM guardian eval */
  kernelAuthoritative?: boolean;
}

export const PLAN_STATE_CAUSAL_PERSONA_KEY = 'causalPersonaProjection' as const;
