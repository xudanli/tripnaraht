/**
 * 规划工作台 · 决策检查器 BFF 读模型
 * @see DECISION_CHECKER_API.md
 */

export const DECISION_CHECKER_SCHEMA = 'tripnara.decision_checker@v1' as const;

export type DecisionCheckerMetricTone = 'good' | 'bad' | 'neutral';

export type DecisionCheckerMetricKey =
  | 'feasibility'
  | 'drive_duration'
  | 'budget'
  | 'poi_kept'
  | string;

export interface DecisionCheckerMetricDto {
  key: DecisionCheckerMetricKey;
  label: string;
  displayValue: string;
  tone: DecisionCheckerMetricTone;
  raw?: {
    delta?: number;
    unit?: 'score' | 'minute' | 'currency' | 'ratio';
    currency?: string;
  };
}

export type DecisionCheckerActionType =
  | 'open_repair_plan'
  | 'apply_relaxation'
  | 'select_option'
  | 'open_feasibility'
  | 'open_evidence'
  | 'run_route_and_run'
  | 'apply_split_plan'
  | 'view_split_alternatives'
  | 'discuss_with_nara';

export type DecisionCheckerSplitPlanKind =
  | 'physical_strength'
  | 'preference'
  | 'weather_adaptive'
  | string;

export type DecisionCheckerSplitVariant = 'blue' | 'orange' | 'purple';

export interface DecisionCheckerSplitGroupMemberDto {
  id: string;
  displayName: string;
}

export interface DecisionCheckerSplitGroupSegmentDto {
  title: string;
  placeName?: string;
  startTime: string;
  endTime?: string;
}

export interface DecisionCheckerSplitGroupDto {
  id: string;
  letter?: string;
  label: string;
  memberCount: number;
  /** 组内全部成员（daySplits.branches[].members 同源） */
  members?: DecisionCheckerSplitGroupMemberDto[];
  /** 卡片摘要 — 组主题（如「高强度体验」「舒适休息」） */
  activityTitle: string;
  /** 该组当日全部分流段（多 POI） */
  segments?: DecisionCheckerSplitGroupSegmentDto[];
  highlights: string[];
  intensity?: 'high' | 'medium' | 'low';
  riskLevel?: 'low' | 'medium' | 'high';
  costPerPerson?: string;
  variant?: DecisionCheckerSplitVariant;
  avatarUrls?: string[];
}

export interface DecisionCheckerSplitLogisticsDto {
  meetupPoint: string;
  meetupTime: string;
  transport?: string;
  emergencyContact?: string;
  guideBooking?: string;
  notes?: string[];
}

export interface DecisionCheckerSplitPlanDto {
  id: string;
  kind: DecisionCheckerSplitPlanKind;
  banner: {
    title: string;
    message: string;
    affectedDays: number[];
    tone?: 'info' | 'warning';
  };
  recommendation: {
    title: string;
    summary: string;
    badge?: string;
    badgeTone?: 'success' | 'warning' | 'neutral';
  };
  metrics: DecisionCheckerMetricDto[];
  groups: DecisionCheckerSplitGroupDto[];
  logistics: DecisionCheckerSplitLogisticsDto;
  risks?: Array<{ title: string; description: string }>;
  aiSuggestion?: DecisionCheckerAiTextDto;
  actions: DecisionCheckerActionDto[];
  snapshotVersion?: string;
}

export interface DecisionCheckerActionDto {
  type: DecisionCheckerActionType;
  label?: string;
  payload?: Record<string, unknown>;
}

export interface DecisionCheckerAiTextDto {
  text: string;
  source?: 'kernel' | 'llm' | 'rule';
  confidence?: number;
}

export interface DecisionCheckerRepairPlanDto {
  id: string;
  source: 'relaxation' | 'gate_compare' | 'feasibility_repair' | 'workbench';
  badge?: string;
  title: string;
  description: string;
  recommended: boolean;
  metrics: DecisionCheckerMetricDto[];
  benefits: string[];
  cta?: DecisionCheckerActionDto;
}

export interface DecisionCheckerOverviewDto {
  conflict: {
    hardCount: number;
    softCount?: number;
    primary?: {
      conflictId: string;
      severity: 'hard' | 'soft';
      title: string;
      message: string;
      affectedDays?: number[];
    };
  };
  repairPlan?: DecisionCheckerRepairPlanDto;
  aiSuggestion?: DecisionCheckerAiTextDto;
}

export type DecisionCheckerEvidenceKind =
  | 'route_engine'
  | 'historical_model'
  | 'weather_road'
  | 'inventory'
  | 'opening_hours'
  | 'persona_trace'
  | 'other';

export interface DecisionCheckerEvidenceItemDto {
  id: string;
  kind: DecisionCheckerEvidenceKind;
  title: string;
  subtitle: string;
  reliability: 'high' | 'medium' | 'low';
  observedAt?: string;
  publisher?: string;
  confidence?: number;
  refs?: Array<{ type: string; id: string }>;
}

export interface DecisionCheckerEvidenceDto {
  items: DecisionCheckerEvidenceItemDto[];
  summary: {
    high: number;
    medium: number;
    low: number;
    lastUpdatedAt?: string;
  };
  judgmentExplanation?: string;
  calculationDetailUrl?: string;
}

export type DecisionCheckerLabeledTone = 'good' | 'bad' | 'neutral' | 'warning';

export interface DecisionCheckerLabeledValueDto {
  label?: string;
  value: string;
  detail?: string;
  tone?: DecisionCheckerLabeledTone;
}

export interface DecisionCheckerImpactedConstraintDto {
  constraintId?: string;
  type: 'hard' | 'soft';
  name: string;
  status: string;
  impact: 'high' | 'medium' | 'low';
}

export interface DecisionCheckerCascadeNodeDto {
  id: string;
  title: string;
  description: string;
  status: 'affected' | 'at_risk' | 'ok';
  order: number;
}

export interface DecisionCheckerImpactDto {
  summary: {
    affectedDays?: DecisionCheckerLabeledValueDto;
    affectedMembers?: DecisionCheckerLabeledValueDto;
    budgetImpact?: DecisionCheckerLabeledValueDto;
    experienceCompletion?: DecisionCheckerLabeledValueDto;
  };
  constraints: DecisionCheckerImpactedConstraintDto[];
  cascade: DecisionCheckerCascadeNodeDto[];
  aiInterpretation?: DecisionCheckerAiTextDto;
}

export interface DecisionCheckerScenarioDto {
  id: string;
  letter?: string;
  title: string;
  badge?: 'recommended' | 'alternative' | 'best';
  badgeLabel?: string;
  description: string;
  variant?: 'blue' | 'orange' | 'purple';
  metrics: DecisionCheckerMetricDto[];
  action?: DecisionCheckerActionDto;
}

export interface DecisionCheckerCounterfactualDto {
  headline?: string;
  subheadline?: string;
  scenarios: DecisionCheckerScenarioDto[];
  ifUnchanged?: {
    riskLevel: 'high' | 'medium' | 'low';
    label: string;
    points: Array<{ title: string; description: string }>;
    recommendation?: DecisionCheckerAiTextDto;
  };
}

export interface DecisionCheckerResponse {
  schema: typeof DECISION_CHECKER_SCHEMA;
  tripId: string;
  generatedAt: string;
  isStale?: boolean;
  staleReason?: string;
  focusConflictId?: string;
  overview: DecisionCheckerOverviewDto;
  evidence: DecisionCheckerEvidenceDto;
  impact: DecisionCheckerImpactDto;
  counterfactual: DecisionCheckerCounterfactualDto;
  snapshotVersion: string;
  actions?: DecisionCheckerActionDto[];
  /** 分流方案读模型（team_fit / 偏好不可调和 / 天气自适应） */
  splitPlan?: DecisionCheckerSplitPlanDto;
  /** 与 splitPlan 关联的中栏并行时间线（planning-conflicts poll ready 时合并） */
  daySplits?: import('./planning-conflicts.types').PlanningDaySplitDto[];
}

export interface DecisionCheckerRefreshBody {
  reason?: string;
  constraintsVersion?: number;
  focusConflictId?: string;
  runMonteCarlo?: boolean;
}

export interface DecisionCheckerRefreshResponse {
  taskId: string;
  pollUrl: string;
}

export interface DecisionCheckerQuery {
  focusConflictId?: string;
  planId?: string;
  constraintsVersion?: number;
  includeStale?: boolean;
  taskId?: string;
}
