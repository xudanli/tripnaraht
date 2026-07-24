/**
 * Departure Gate — 组合门控类型
 * @see internal-docs/product/PRODUCT_READINESS_MODEL.md
 * @see DEPARTURE_GATE_API.md
 */

export type DepartureGateStatus =
  | 'READY'
  | 'BLOCKED_BY_PLAN'
  | 'BLOCKED_BY_PREPARATION'
  | 'BLOCKED_BY_BOTH'
  | 'REVALIDATION_REQUIRED';

export type PlanVerdictStatus =
  | 'EXECUTABLE'
  | 'ADJUST_REQUIRED'
  | 'NOT_EXECUTABLE'
  | 'STALE'
  | 'UNKNOWN'
  | 'NOT_VALIDATED';

export type PreparationVerdictStatus =
  | 'COMPLETE'
  | 'IN_PROGRESS'
  | 'BLOCKED'
  | 'NOT_STARTED';

export interface PlanVerdictDto {
  status: PlanVerdictStatus;
  /** 计划侧是否可执行（不含出发准备） */
  canExecutePlan: boolean;
  headline: string;
  subheadline?: string;
  mustHandleCount: number;
  suggestAdjustCount: number;
  verifiedAt?: string;
  verifiedForTripVersion?: string;
  currentTripVersion: string;
  isStale: boolean;
  gateExecuteBlocked: boolean;
}

export interface PreparationVerdictDto {
  status: PreparationVerdictStatus;
  /** blocker 未完成则 false */
  canDepartByPreparation: boolean;
  completionPercent: number;
  openBlockerCount: number;
  openMustCount: number;
  openShouldCount: number;
  completedItemCount: number;
  totalTrackedItemCount: number;
  headline: string;
  subheadline?: string;
}

export interface EvidenceFreshnessDto {
  isStale: boolean;
  validatedAt?: string;
  verifiedForTripVersion?: string;
  currentTripVersion: string;
  revalidationRequired: boolean;
  phaseHint?: string;
}

export interface DepartureGateTravelStatusSummaryDto {
  planLabel: string;
  preparationLabel: string;
  validationLabel: string;
}

export interface DepartureGateResponseDto {
  schema: 'tripnara.departure_gate@v1';
  tripId: string;
  calculatedAt: string;
  status: DepartureGateStatus;
  /** 计划可执行 + 出发准备完成 + 验证有效 */
  canStartExecution: boolean;
  /**
   * @deprecated 使用 canStartExecution；历史语义等同 feasibility-report.canStartExecute（仅计划侧）
   */
  canStartExecutePlanOnly: boolean;
  planVerdict: PlanVerdictDto;
  preparationVerdict: PreparationVerdictDto;
  evidenceFreshness: EvidenceFreshnessDto;
  /** C 端统一摘要（非加权总分） */
  travelStatusSummary: DepartureGateTravelStatusSummaryDto;
  /** 深链 */
  links: {
    feasibilityReport: string;
    departurePreparation?: string;
    decisionChecker?: string;
    prerequisites?: string;
  };
}
