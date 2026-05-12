import type { ConvergenceResult } from '../convergence/convergence.types';
import type { TripDraftState } from '../state/trip-draft-state.types';

export type DraftGateStatus = 'APPROVED' | 'REJECTED' | 'NEEDS_REPAIR';

export interface DraftGateScores {
  /** 与收敛一致度对齐 */
  feasibility: number;
  continuity: number;
  constraintSatisfaction: number;
}

export interface DraftGateBlockingIssue {
  type: string;
  day: number;
  slot: string;
  detail?: string;
}

export interface DraftGateRepairAction {
  action: string;
  day?: number;
  slot?: string;
  placeId?: number;
  target?: string;
}

export interface DraftValidationGateResult {
  status: DraftGateStatus;
  score: DraftGateScores;
  blockingIssues: DraftGateBlockingIssue[];
  repairActions: DraftGateRepairAction[];
}

export interface DraftValidationGateInput {
  state: TripDraftState;
  convergence: ConvergenceResult;
  /** 双路径是否都实际执行（门控：禁止仅凭 LLM 通过） */
  llmEngineRan: boolean;
  algoEngineRan: boolean;
  options?: {
    /** 低于此一致度则 NEEDS_REPAIR（默认 0.55） */
    minAgreementToApprove?: number;
    /** 低于此一致度则 REJECT（默认 0.15） */
    hardRejectBelowAgreement?: number;
    /** 分歧槽位数超过该值则 NEEDS_REPAIR */
    maxDivergenceSlots?: number;
    /**
     * 已完成 Slot 级仲裁融合：不再因「原始 LLM/Algo 选点不同」单独判 NEEDS_REPAIR；
     * 仍以一致度、双引擎、最大分歧数做保护（配合 Repair Loop）。
     */
    acceptSlotArbitrationMerge?: boolean;
  };
}
