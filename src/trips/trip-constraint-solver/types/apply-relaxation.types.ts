import type { ConstraintsSummaryResponse } from './constraints-summary.types';

export type ApplyRelaxationBodyDto = {
  /** 用户从 RelaxationSuggestionBar 选择的 actionId 列表（通常 1 项） */
  actionIds: string[];
  /** 乐观锁：与 GET constraints-summary 返回的 constraintsVersion 对齐 */
  constraintsVersion?: number;
  /** 溯源：relaxation_bar | clarification_submit */
  source?: 'relaxation_bar' | 'clarification_submit';
  /** true 时在持久化后同步触发 route_and_run 重算（默认 false，避免意外长耗时） */
  recalc?: boolean;
};

export type AppliedRelaxationRecord = {
  actionId: string;
  constraintIds?: string[];
  schema: 'tripnara.relaxation_constraint_write@v1';
};

export type ApplyRelaxationRecalcSummary = {
  request_id: string;
  status?: string;
  has_comparison: boolean;
  relaxation_cleared: boolean;
};

export type ApplyRelaxationResponse = {
  tripId: string;
  constraintsVersion: number;
  applied: AppliedRelaxationRecord[];
  summary: ConstraintsSummaryResponse;
  /** FE 未传 recalc=true 时应再调 route_and_run */
  recalcRecommended: true;
  recalc?: ApplyRelaxationRecalcSummary;
};
