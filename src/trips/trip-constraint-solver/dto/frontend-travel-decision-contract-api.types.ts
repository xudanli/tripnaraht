/**
 * 旅行决策合同 / 约束控制台 — 前端 TypeScript 类型
 *
 * 可直接复制到前端仓库，或通过 monorepo 路径导入：
 * `@/trips/trip-constraint-solver/dto/frontend-travel-decision-contract-api.types`
 */

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: Record<string, unknown> };
}

export const TRAVEL_PRINCIPLE_KEYS = [
  'SAFETY',
  'PACE',
  'CORE_EXPERIENCE',
  'BUDGET',
  'FEWER_HOTEL_CHANGES',
  'FLEXIBILITY',
  'COVERAGE',
  'PHOTOGRAPHY',
  'FAMILY_COMFORT',
] as const;

export type TravelPrincipleKey = (typeof TRAVEL_PRINCIPLE_KEYS)[number];

export const TRAVEL_PRINCIPLE_LABELS: Record<TravelPrincipleKey, string> = {
  SAFETY: '安全第一',
  PACE: '行程轻松',
  CORE_EXPERIENCE: '核心体验优先',
  BUDGET: '预算优先',
  FEWER_HOTEL_CHANGES: '少换住宿',
  FLEXIBILITY: '保留弹性',
  COVERAGE: '尽可能多看',
  PHOTOGRAPHY: '摄影体验优先',
  FAMILY_COMFORT: '老人儿童体验优先',
};

export type ChangeStrategyArchetype = 'CONSERVATIVE' | 'BALANCED' | 'EXPLORATORY';

export const CHANGE_STRATEGY_LABELS: Record<ChangeStrategyArchetype, string> = {
  CONSERVATIVE: '保守型',
  BALANCED: '平衡型',
  EXPLORATORY: '探索型',
};

export type AutomationLevel =
  | 'INFORM_ONLY'
  | 'SUGGEST'
  | 'AUTO_REPAIR_LOW_RISK'
  | 'AUTO_EXECUTE_CONDITIONAL';

export const AUTOMATION_LEVEL_LABELS: Record<AutomationLevel, string> = {
  INFORM_ONLY: '仅提醒',
  SUGGEST: '建议方案',
  AUTO_REPAIR_LOW_RISK: '低风险自动修复',
  AUTO_EXECUTE_CONDITIONAL: '条件式自动执行',
};

export type TravelDecisionContractSectionKey =
  | 'travel_objectives'
  | 'hard_must_satisfy'
  | 'soft_prefer'
  | 'team_members'
  | 'change_strategy'
  | 'automation'
  | 'conflicts_and_impact'
  | 'readonly_official'
  | 'readonly_world';

export interface TripConstraintScope {
  type: string;
  ids?: string[];
}

export interface TripConstraintSource {
  type: string;
  sourceId?: string;
  /** 约束模板 id — 前后端对齐判定规则 */
  templateId?: string;
}

export type ViolationResultCode = 'BLOCK' | 'CONFIRM';

export type DestinationRuleCategory =
  | 'TRAFFIC'
  | 'NATURAL_RISK'
  | 'VENUE_ACCESS'
  | 'REGULATION'
  | 'SERVICE_AVAILABILITY';

export type DestinationRuleTier = 'BLOCK' | 'CONDITIONAL' | 'ADVISORY';

export type DestinationRuleVerificationStatus = 'CURRENT' | 'OUTDATED' | 'PENDING';

export interface DestinationRuleValue {
  destinationRuleCategory: DestinationRuleCategory;
  destinationRuleTier: DestinationRuleTier;
  sourceAgency?: string;
  applicableScope?: string;
  judgmentRule: string;
  violationResult: string;
  tripImpact?: string;
  evidenceRef?: string;
  evidenceVerifiedAt?: string;
  [key: string]: unknown;
}

export interface TripConstraintContractMeta {
  enabledSummary: string;
  scopeLabel: string;
  judgmentRule: string;
  violationResult: ViolationResultCode;
  violationResultLabel: string;
}

export interface TripConstraintCapability {
  constraintKey: string;
  enforcementLevel: 'ENABLED' | 'PARTIAL' | 'DISPLAY_ONLY' | 'ADVISORY_ONLY';
  phase0UiPolicy: 'OPEN' | 'DISPLAY_ONLY' | 'HIDDEN' | 'DEFAULT_ONLY';
  stages?: {
    planning: boolean;
    feasibility: boolean;
    execution: boolean;
    tep: boolean;
    optimizer: boolean;
  };
}

export interface TripConstraint {
  id: string;
  tripId: string;
  name: string;
  description?: string;
  category: string;
  type: 'HARD' | 'SOFT' | 'EXTERNAL';
  status: string;
  scope: TripConstraintScope;
  operator: string;
  value: unknown;
  unit?: string;
  priority?: number;
  allowRelaxation: boolean;
  locked: boolean;
  source: TripConstraintSource;
  visibility: string;
  hasConflict?: boolean;
  cardTone?: 'default' | 'caution' | 'danger' | 'muted';
  backing?: { kind: string; field?: string; wishId?: string };
  /** 是否启用（status=DISABLED 时为 false） */
  enabled: boolean;
  /** 侧栏摘要 */
  displayValue?: string;
  /** 四项元数据 SSOT — 优先于前端静态规则表 */
  contractMeta?: TripConstraintContractMeta;
  /** Phase 0 Capability Registry — 替代 type===HARD 推断 enforce / 验证色 */
  capability?: TripConstraintCapability;
  /** OFFICIAL_RULE 固定 readonly_official，不可 PATCH */
  sectionKey?: 'readonly_official' | 'readonly_world';
  verificationStatus?: DestinationRuleVerificationStatus;
}

export interface TravelPrincipleDisplay {
  key: TravelPrincipleKey;
  label: string;
  rank: number;
}

export interface TravelObjectiveProfile {
  rankedPrinciples: TravelPrincipleKey[];
  version: number;
  updatedAt?: string;
}

export interface ChangeStrategyProfile {
  archetype: ChangeStrategyArchetype;
  tolerances: {
    maxBudgetOverrunPct?: number;
    maxDelayMinutes?: number;
    maxPoiRemovals?: number;
    allowTemporaryLodgingChange?: boolean;
    allowSameDayReroute?: boolean;
    acceptLowConfidencePlans?: boolean;
  };
}

export interface AutomationPolicy {
  defaultLevel: AutomationLevel;
  autoAllowed: string[];
  confirmationRequired: string[];
}

export interface TeamGovernanceRule {
  topic: string;
  rule: 'UNANIMOUS' | 'MAJORITY' | 'PAYER_CONFIRM' | 'VETO' | 'PROTECTIVE_PRIORITY';
  memberRole?: string;
  thresholdPct?: number;
}

export interface TeamGovernancePolicy {
  rules: TeamGovernanceRule[];
}

export interface TravelDecisionContract {
  schemaId: 'tripnara.travel_decision_contract@v1';
  tripId: string;
  constraintsVersion: number;
  objectives: TravelObjectiveProfile;
  displayPrinciples: TravelPrincipleDisplay[];
  compiledWeights: {
    legacy: Record<string, number>;
    canonical: Record<string, number>;
    softPreferences?: Record<string, number>;
  };
  changeStrategy: ChangeStrategyProfile;
  automation: AutomationPolicy;
  teamGovernance: TeamGovernancePolicy;
  conflicts: {
    hasConflicts: boolean;
    mustHandle: number;
    suggestAdjust: number;
    pendingConfirm: number;
    conflictConstraintIds: string[];
  };
}

export interface TravelDecisionContractSection {
  key: TravelDecisionContractSectionKey;
  label: string;
  constraintIds: string[];
  readonly?: boolean;
  contractBlock?: 'objectives' | 'change_strategy' | 'automation' | 'team_governance' | 'conflicts';
}

export interface TripConstraintsListResponse {
  meta: {
    tripId: string;
    constraintsVersion: number;
    total: number;
    byType: Record<string, number>;
    byStatus: Record<string, number>;
    conflictCount: number;
    pendingConfirmCount: number;
    countryCode?: string;
    sections: TravelDecisionContractSection[];
  };
  items: TripConstraint[];
  contract: TravelDecisionContract;
}

export interface PatchTravelDecisionContractRequest {
  objectives?: { rankedPrinciples: TravelPrincipleKey[] };
  changeStrategy?: Partial<ChangeStrategyProfile>;
  automation?: Partial<AutomationPolicy>;
  teamGovernance?: Partial<TeamGovernancePolicy>;
  constraintsVersion?: number;
}

export interface PatchTravelDecisionContractResponse {
  contract: TravelDecisionContract;
  constraints: {
    constraintsVersion: number;
    constraintsConfirmedAt: string | null;
    constraintsConfirmedBy: string | null;
  };
}

export interface ConstraintImpactStructuredPreview {
  summaryBullets: string[];
  executeability?: {
    scoreBefore?: number;
    scoreAfter?: number;
    scoreDelta?: number;
    gradeBefore?: string;
    gradeAfter?: string;
  };
  schedule?: {
    scheduleDetailLevel?: 'none' | 'day_summary' | 'activity';
    scheduleDetailUnavailableReason?: string;
    affectedDays?: Array<{ dayNumber: number; tone: 'major' | 'minor' }>;
    affectedDayDetails?: Array<{
      dayNumber: number;
      tone: 'major' | 'minor';
      daySummary: string;
      items?: Array<{
        itemId?: string;
        label: string;
        startTimeLabel?: string;
        detail: string;
        impactType: 'DRIVE_OVER_LIMIT' | 'TIME_WINDOW' | 'REMOVED';
      }>;
    }>;
    daysNeedingSplit?: number[];
    extraLodgingNights?: number;
    poisToRelocate?: Array<{ dayNumber: number; itemId?: string; label?: string }>;
  };
  budget?: {
    deltaAmount?: number;
    deltaPct?: number;
    currency?: string;
  };
  constraintChanges: Array<{
    constraintId: string;
    name?: string;
    before?: unknown;
    after?: unknown;
    unit?: string;
    userFacingSummary?: string;
  }>;
}

export type ConstraintImpactPreviewVerdict =
  | 'STILL_NOT_EXECUTABLE'
  | 'IMPROVED'
  | 'NOW_EXECUTABLE'
  | 'NEEDS_CONFIRM';

export interface ConstraintImpactUserSummary {
  verdict: ConstraintImpactPreviewVerdict;
  verdictLabel: string;
  verdictReason: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  previewMode: 'quick' | 'deep';
}

export interface ConstraintImpactSuggestedFollowUp {
  label: string;
  action: 'OPEN_FEASIBILITY_REPORT' | 'CONFIRM_AND_DEEP_CHECK' | 'NONE';
  deepLink?: string;
}

export interface TripConstraintImpactPreviewResponse {
  tripId: string;
  constraintsVersion: number;
  refreshType: 'quick' | 'deep';
  affectedDays?: number[];
  affectedItemIds?: string[];
  budgetDelta?: { amount: number; currency: string };
  conflictsBefore: { mustHandle: number; suggestAdjust: number; pendingConfirm: number };
  conflictsAfter?: { mustHandle: number; suggestAdjust: number; pendingConfirm: number };
  recommendations: string[];
  diffBullets?: string[];
  userSummary?: ConstraintImpactUserSummary;
  suggestedFollowUp?: ConstraintImpactSuggestedFollowUp;
  executeabilityDelta?: {
    scoreDelta?: number;
    mustHandleDelta?: number;
    suggestAdjustDelta?: number;
    scoreDeltaReason?: string;
    blockingRuleIds?: string[];
    conflictsDeltaSummary?: {
      mustHandle?: { before: number; after?: number; label: string };
      suggestAdjust?: { before: number; after?: number; label: string };
      pendingConfirm?: { before: number; after?: number; label: string };
    };
  };
  scheduleDetailLevel?: 'none' | 'day_summary' | 'activity';
  scheduleDetailUnavailableReason?: string;
  affectedDayDetails?: ConstraintImpactStructuredPreview['schedule'] extends { affectedDayDetails?: infer D }
    ? D
    : never;
  constraintAssessments?: import('./frontend-constraint-assessment-api.types').UnifiedConstraintAssessmentView[];
  meta?: { debug?: Record<string, unknown> };
  assessBefore?: { overallAverageScore: number; overallGrade: string };
  assessAfter?: { overallAverageScore: number; overallGrade: string };
  structuredImpact?: ConstraintImpactStructuredPreview;
}

export interface TripConstraintCheckResponse {
  tripId: string;
  hasConflicts: boolean;
  summary: {
    mustHandle: number;
    suggestAdjust: number;
    pendingConfirm: number;
    total: number;
  };
  conflicts: Array<{
    id: string;
    title: string;
    message: string;
    priority: string;
    relatedConstraintIds?: string[];
  }>;
  contractConflicts?: TravelDecisionContract['conflicts'];
}

/** 前端分区视图 — 由 buildConstraintConsoleSections 生成 */
export interface ConstraintConsoleSectionView {
  section: TravelDecisionContractSection;
  constraints: TripConstraint[];
  contractBlock?: TravelDecisionContractSection['contractBlock'];
}

export interface ConstraintConsoleViewModel {
  constraintsVersion: number;
  itemsById: Record<string, TripConstraint>;
  sections: ConstraintConsoleSectionView[];
  contract: TravelDecisionContract;
}
