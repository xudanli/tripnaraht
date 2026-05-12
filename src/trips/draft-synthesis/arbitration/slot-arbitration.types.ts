import type { CandidatePlace } from '../../services/candidate-retrieval.engine';
import type { TripDraftSelection } from '../state/trip-draft-state.types';

export type SlotDecisionSource = 'LLM' | 'ALGO' | 'HYBRID';

export interface HybridScoreBreakdown {
  continuity: number;
  preferenceMatch: number;
  geoEfficiency: number;
  total: number;
}

export interface SlotDecision {
  day: number;
  slot: string;
  llmChoice: TripDraftSelection | null;
  algoChoice: TripDraftSelection | null;
  finalChoice: TripDraftSelection;
  decisionSource: SlotDecisionSource;
  reason: string;
  /** HYBRID 路径下的分项（可选） */
  hybridScores?: { llm: HybridScoreBreakdown; algo: HybridScoreBreakdown };
}

export interface SlotArbitrationResult {
  slotDecisions: SlotDecision[];
  /** 按天时间序合并后的最终选点（用于 TripDraftState.selections） */
  finalSelections: TripDraftSelection[];
  /** 人类可读追溯 */
  overrideTrace: string[];
}

export interface SlotArbitrationParams {
  llmSelections: TripDraftSelection[];
  algoSelections: TripDraftSelection[];
  candidatesById: Map<number, CandidatePlace>;
  /** walk | transit | car 等，影响硬约束距离阈值 */
  transport?: string;
  /**
   * HYBRID 分项比较时的引擎偏置（Persona / PolicyEngine；缺省 0.5/0.5 与历史行为一致）。
   */
  hybridEngineWeights?: { llm: number; algo: number };
}
