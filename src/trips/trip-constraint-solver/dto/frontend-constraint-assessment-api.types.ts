/**
 * 统一约束评估读模型 — 前端 TypeScript 类型（Phase 0）
 *
 * 可直接复制到 Plan Studio，或与 constraint console types 同目录导入。
 * SSOT 后端：`decision-runtime/constraints/contracts/unified-constraint-assessment.types.ts`
 */

export type ConstraintEvaluationStatus =
  | 'PASS'
  | 'BLOCK'
  | 'WARNING'
  | 'UNKNOWN'
  | 'REQUIRES_VERIFICATION';

export type UnifiedAssessmentLaneKind = 'planning' | 'executability' | 'runtime';

export type UnifiedAssessmentAggregateStatus =
  | 'PASS'
  | 'WARN'
  | 'PLANNING_BLOCK'
  | 'EXECUTION_BLOCK'
  | 'RUNTIME_BLOCK'
  | 'UNKNOWN';

export interface UnifiedConstraintAssessmentEvidence {
  day?: number;
  dayIndex?: number;
  actual?: string;
  measuredMinutes?: number;
  ruleId?: string;
  message?: string;
  affectedRefs?: string[];
}

export interface UnifiedConstraintAssessmentLane {
  status: ConstraintEvaluationStatus;
  source: 'FEASIBILITY' | 'TEP' | 'RUNTIME';
  ruleId?: string;
  message?: string;
  assessmentId?: string;
  evidence?: UnifiedConstraintAssessmentEvidence;
  problemIds?: string[];
}

export interface UnifiedConstraintAssessmentView {
  constraintKey: string;
  legacyConstraintId?: string;
  contractRequirement?: string;
  contextVersion: {
    tripId: string;
    version: string;
    countryCode?: string;
  };
  evaluatedAt: string;
  lanes: {
    planning: UnifiedConstraintAssessmentLane | null;
    executability: UnifiedConstraintAssessmentLane | null;
    runtime: UnifiedConstraintAssessmentLane | null;
  };
  aggregateStatus: UnifiedAssessmentAggregateStatus;
  problemIds?: string[];
}

export interface UnifiedConstraintAssessmentBundle {
  schemaId: 'tripnara.unified_constraint_assessment_bundle@v1';
  tripId: string;
  generatedAt: string;
  contextVersion: UnifiedConstraintAssessmentView['contextVersion'];
  items: UnifiedConstraintAssessmentView[];
  meta: {
    itemCount: number;
    planVersionRef?: string;
  };
}

/** Lane badge — 卡片内「规划 / 执行」行 */
export interface ConstraintAssessmentLaneBadge {
  kind: UnifiedAssessmentLaneKind;
  label: string;
  status: ConstraintEvaluationStatus;
  statusLabel: string;
  source?: 'FEASIBILITY' | 'TEP' | 'RUNTIME';
  ruleId?: string;
  message?: string;
  evidenceSummary?: string;
  problemIds?: string[];
}

/** aggregateStatus → UI 语义（禁止用 constraint.type 推断） */
export interface ConstraintAggregateStatusUi {
  aggregateStatus: UnifiedAssessmentAggregateStatus;
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'neutral';
  /** 卡片左边线 / 状态 chip */
  accent: 'pass' | 'warn' | 'block' | 'unknown';
  isBlocking: boolean;
}

/** Constraint Console 卡片 — Contract + Assessment 合并视图 */
export interface ConstraintCardView {
  constraintId: string;
  constraintKey?: string;
  name: string;
  contractRequirement?: string;
  readonly: boolean;
  highlighted: boolean;
  /** 合同层 cardTone（冲突/草稿）；验证色由 aggregateUi 驱动 */
  contractCardTone?: 'default' | 'caution' | 'danger' | 'muted';
  assessment: UnifiedConstraintAssessmentView | null;
  aggregateUi: ConstraintAggregateStatusUi;
  laneBadges: ConstraintAssessmentLaneBadge[];
  problemIds?: string[];
  repairDeepLink?: string;
}

export interface ConstraintConsoleWithAssessmentsViewModel {
  console: import('./frontend-travel-decision-contract-api.types').ConstraintConsoleViewModel;
  assessments: UnifiedConstraintAssessmentBundle;
  cardsByConstraintId: Record<string, ConstraintCardView>;
  sections: Array<{
    section: import('./frontend-travel-decision-contract-api.types').TravelDecisionContractSection;
    contractBlock?: import('./frontend-travel-decision-contract-api.types').TravelDecisionContractSection['contractBlock'];
    cards: ConstraintCardView[];
  }>;
}
