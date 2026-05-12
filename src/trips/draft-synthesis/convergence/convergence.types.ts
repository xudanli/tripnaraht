import type { TripDraftSelection } from '../state/trip-draft-state.types';

/** 与 winnerStrategy 对齐的收敛模式 */
export type ConvergenceMode = 'ALGO_WIN' | 'LLM_WIN' | 'HYBRID';

export type GlobalWinnerStrategy = 'LLM' | 'ALGO' | 'HYBRID';

export type DivergenceKind =
  | 'distance'
  | 'meal'
  | 'time'
  | 'zone'
  | 'experience'
  | 'coverage'
  | 'other';

export interface DivergenceArea {
  day: number;
  slot: string;
  type: DivergenceKind;
  llmChoice: number | null;
  algoChoice: number | null;
  reason: string;
}

export interface ConvergencePolicy {
  /** 午/晚餐分歧时优先算法（强约束/可达） */
  preferAlgoForMeals: boolean;
  /** 白天观光分歧时优先 LLM（体验叙事） */
  preferLlmForExperienceSlots: boolean;
  /** 全局偏置：覆盖分槽 HYBRID（仅 ALGO | LLM） */
  globalBias?: 'ALGO' | 'LLM';
}

export const DEFAULT_CONVERGENCE_POLICY: ConvergencePolicy = {
  preferAlgoForMeals: true,
  preferLlmForExperienceSlots: true,
};

export interface ConvergenceResult {
  agreementScore: number;
  divergenceAreas: DivergenceArea[];
  winnerStrategy: GlobalWinnerStrategy;
  /** 与策略旋钮对齐的离散模式 */
  convergenceMode: ConvergenceMode;
  /** 经分槽融合后的统一选点（可写入 TripDraftState.selections） */
  overridePlan: TripDraftSelection[];
}
