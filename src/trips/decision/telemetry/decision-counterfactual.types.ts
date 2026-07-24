/**
 * Counterfactual projections — 每个未选候选必须可回答「若当时选它会发生什么」
 */

import type { DecisionNormalizedOutcome } from './decision-outcome-normalized.types';

export interface CounterfactualFactorDelta {
  factor_id: string;
  direction: 'increases' | 'decreases';
  /** 0–1 影响幅度 */
  magnitude: number;
}

export interface CandidateCounterfactualProjection {
  /** 若选此候选的预估结果 */
  projected_outcome: Partial<DecisionNormalizedOutcome>;
  projected_friction_score?: number;
  feasibility_probability?: number;
  /** 相对已选方案的效用差（负 = 更差） */
  utility_delta_vs_chosen?: number;
  causal_factor_deltas?: CounterfactualFactorDelta[];
  narrative_zh?: string;
}

export interface CounterfactualReplayResult {
  decision_log_id: string;
  chosen_option_id: string;
  alternative_option_id: string;
  question_zh: string;
  answer_zh: string;
  projection: CandidateCounterfactualProjection;
  replay_confidence: number;
  source: 'stored_projection' | 'inferred_from_context';
}
