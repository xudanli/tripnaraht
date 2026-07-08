/**
 * 约束控制台统一 SSOT — TripConstraint 读模型（PRD §10）
 * 合成自 intent / budget / pacing / wishes / feasibility 等存量字段。
 */

export const TRIP_CONSTRAINT_CATEGORIES = [
  'TIME',
  'BUDGET',
  'DESTINATION',
  'ACTIVITY',
  'TRANSPORT',
  'ACCOMMODATION',
  'MEMBER',
  'SAFETY',
  'WORLD_STATE',
  'CUSTOM',
] as const;

export type TripConstraintCategory = (typeof TRIP_CONSTRAINT_CATEGORIES)[number];

export const TRIP_CONSTRAINT_TYPES = ['HARD', 'SOFT', 'EXTERNAL'] as const;
export type TripConstraintType = (typeof TRIP_CONSTRAINT_TYPES)[number];

export const TRIP_CONSTRAINT_STATUSES = [
  'DRAFT',
  'ACTIVE',
  'LOCKED',
  'CONFLICTED',
  'SATISFIED',
  'UNSATISFIED',
  'OUTDATED',
  'DISABLED',
  'SUPERSEDED',
] as const;
export type TripConstraintStatus = (typeof TRIP_CONSTRAINT_STATUSES)[number];

export const TRIP_CONSTRAINT_SCOPE_TYPES = [
  'TRIP',
  'DAY',
  'ITEM',
  'ROUTE_SEGMENT',
  'MEMBER',
  'MEMBER_GROUP',
  'DOMAIN',
  'PLAN',
] as const;
export type TripConstraintScopeType = (typeof TRIP_CONSTRAINT_SCOPE_TYPES)[number];

export const TRIP_CONSTRAINT_OPERATORS = [
  'EQ',
  'NE',
  'LTE',
  'GTE',
  'IN',
  'NOT_IN',
  'BEFORE',
  'AFTER',
  'CONTAINS',
  'CUSTOM',
] as const;
export type TripConstraintOperator = (typeof TRIP_CONSTRAINT_OPERATORS)[number];

export const TRIP_CONSTRAINT_SOURCE_TYPES = [
  'USER',
  'MEMBER',
  'AI_INFERRED',
  'PRIVATE_WISH',
  'TEAM_CONSENSUS',
  'OFFICIAL_RULE',
  'WORLD_DATA',
] as const;
export type TripConstraintSourceType = (typeof TRIP_CONSTRAINT_SOURCE_TYPES)[number];

export const TRIP_CONSTRAINT_VISIBILITY = [
  'PRIVATE',
  'ANONYMOUS',
  'TEAM',
  'ROLE_RESTRICTED',
] as const;
export type TripConstraintVisibility = (typeof TRIP_CONSTRAINT_VISIBILITY)[number];

/** 合成约束稳定 ID（legacy 字段映射） */
export const TRIP_CONSTRAINT_LEGACY_IDS = {
  TIME_RANGE: 'c_time_range',
  BUDGET_TOTAL: 'c_budget_total',
  TRAVELERS: 'c_travelers',
  TRANSPORT_MODE: 'c_transport_mode',
  PACING_LEVEL: 'c_pacing_level',
  MUST_PLACES: 'c_must_places',
  AVOID_PLACES: 'c_avoid_places',
  DAILY_WALK_LIMIT: 'c_daily_walk_limit',
  MAX_SEGMENT_DISTANCE: 'c_max_segment_distance',
  MAX_DAILY_DRIVE: 'c_max_daily_drive',
  NO_NIGHT_DRIVE: 'c_no_night_drive',
  PLANNING_POLICY: 'c_planning_policy',
  LUNCH_STRATEGY: 'c_lunch_strategy',
  WORLD_FEASIBILITY: 'c_world_feasibility',
} as const;

/** 冰岛官方运营规则（只读 EXTERNAL；合成注入，不持久化） */
export const TRIP_CONSTRAINT_OFFICIAL_IS_IDS = {
  FROAD_2WD: 'c_official_is_froad_2wd',
  WINTER_FROAD: 'c_official_is_winter_froad',
  RED_ALERT: 'c_official_is_red_alert',
  WIND_SAFETY: 'c_official_is_wind_safety',
} as const;

export type TripConstraintLegacyId =
  (typeof TRIP_CONSTRAINT_LEGACY_IDS)[keyof typeof TRIP_CONSTRAINT_LEGACY_IDS];

export interface TripConstraintScope {
  type: TripConstraintScopeType;
  ids?: string[];
  /** 前端粗粒度 scope 别名 — 细粒度以 value.scopeBinding 为准 */
  dayIndex?: number;
}

/** value.scopeBinding — 约束生效范围（PATCH 原样持久化，GET 完整回显） */
export type ConstraintTemporalKind =
  | 'trip'
  | 'day'
  | 'day_range'
  | 'route_segment'
  | 'destination';

export interface ConstraintTemporalScopeBinding {
  kind: ConstraintTemporalKind;
  dayNumber?: number;
  dayFrom?: number;
  dayTo?: number;
  segmentId?: string;
  fromItemId?: string;
  toItemId?: string;
  destinationId?: string;
  label?: string;
}

export type ConstraintMemberKind = 'all' | 'primary_driver' | 'members';

export interface ConstraintMemberScopeBinding {
  kind: ConstraintMemberKind;
  memberIds?: string[];
  labels?: string[];
  /** PATCH 时服务端解析 primary_driver 后写入 */
  resolvedMemberId?: string;
}

export interface ConstraintPhaseScopeBinding {
  planning: boolean;
  execution: boolean;
}

export interface ConstraintActivityScopeBinding {
  kind: 'all' | 'specific' | string;
  activityIds?: string[];
  labels?: string[];
}

export interface ConstraintScopeBinding {
  temporal: ConstraintTemporalScopeBinding;
  member: ConstraintMemberScopeBinding;
  phase: ConstraintPhaseScopeBinding;
  activity: ConstraintActivityScopeBinding;
}

export interface TripConstraintSource {
  type: TripConstraintSourceType;
  sourceId?: string;
  /** 约束模板 id — 前后端对齐判定规则 */
  templateId?: string;
}

export type ViolationResultCode = 'BLOCK' | 'CONFIRM';

export const DESTINATION_RULE_CATEGORIES = [
  'TRAFFIC',
  'NATURAL_RISK',
  'VENUE_ACCESS',
  'REGULATION',
  'SERVICE_AVAILABILITY',
] as const;
export type DestinationRuleCategory = (typeof DESTINATION_RULE_CATEGORIES)[number];

export const DESTINATION_RULE_TIERS = ['BLOCK', 'CONDITIONAL', 'ADVISORY'] as const;
export type DestinationRuleTier = (typeof DESTINATION_RULE_TIERS)[number];

export const DESTINATION_RULE_VERIFICATION_STATUSES = [
  'CURRENT',
  'OUTDATED',
  'PENDING',
] as const;
export type DestinationRuleVerificationStatus =
  (typeof DESTINATION_RULE_VERIFICATION_STATUSES)[number];

export interface DestinationRuleValue {
  destinationRuleCategory: DestinationRuleCategory;
  destinationRuleTier: DestinationRuleTier;
  sourceAgency?: string;
  applicableScope?: string;
  judgmentRule: string;
  /** 人话：阻断路线 / 检查条件是否满足 / 影响风险评分 */
  violationResult: string;
  tripImpact?: string;
  evidenceRef?: string;
  evidenceVerifiedAt?: string;
  ruleId?: string;
  countryCode?: string;
  severity?: string;
  [key: string]: unknown;
}

export interface TripConstraintContractMeta {
  enabledSummary: string;
  scopeLabel: string;
  judgmentRule: string;
  violationResult: ViolationResultCode;
  /** 人话：阻断执行 / 需确认后调整 */
  violationResultLabel: string;
}

/** 用户自定义约束（metadata.unifiedConstraints） */
export interface StoredUnifiedConstraint {
  id: string;
  name: string;
  description?: string;
  category: TripConstraintCategory;
  type: TripConstraintType;
  status?: TripConstraintStatus;
  scope: TripConstraintScope;
  operator: TripConstraintOperator;
  value: unknown;
  unit?: string;
  tolerance?: unknown;
  priority?: number;
  allowRelaxation: boolean;
  locked: boolean;
  source: TripConstraintSource;
  visibility: TripConstraintVisibility;
  evidenceIds?: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type TripConstraintCardTone = 'default' | 'caution' | 'danger' | 'muted';

export interface TripConstraint {
  id: string;
  tripId: string;
  name: string;
  description?: string;
  category: TripConstraintCategory;
  type: TripConstraintType;
  status: TripConstraintStatus;
  scope: TripConstraintScope;
  operator: TripConstraintOperator;
  value: unknown;
  unit?: string;
  tolerance?: unknown;
  priority?: number;
  allowRelaxation: boolean;
  locked: boolean;
  source: TripConstraintSource;
  visibility: TripConstraintVisibility;
  evidenceIds?: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** 合成约束：指向存量写字段（intent / budget / wish 等） */
  backing?: {
    kind: 'legacy_field' | 'unified_store' | 'wish' | 'world_snapshot' | 'official_rule';
    field?: string;
    wishId?: string;
  };
  /** 是否存在与当前方案/其他约束的冲突 */
  hasConflict?: boolean;
  /** 左侧约束卡片视觉强调（非 HARD=红框；仅冲突/待确认才 accent） */
  cardTone?: TripConstraintCardTone;
  /** 是否启用（status=DISABLED 时为 false；BFF 投影后必有） */
  enabled?: boolean;
  /** 侧栏摘要（可选） */
  displayValue?: string;
  /** 四项元数据 SSOT — 优先于前端静态规则表 */
  contractMeta?: TripConstraintContractMeta;
  /** 分区 key — BFF 投影 */
  sectionKey?:
    | 'soft_prefer'
    | 'hard_must_satisfy'
    | 'readonly_official'
    | 'readonly_world';
  /** 目的地规则证据 freshness */
  verificationStatus?: DestinationRuleVerificationStatus;
}

export interface TripConstraintsListSection {
  key: string;
  label: string;
  /** 该分区下的 constraintId 顺序（前端直接按 id 渲染） */
  constraintIds: string[];
  readonly?: boolean;
  contractBlock?: 'objectives' | 'change_strategy' | 'automation' | 'team_governance' | 'conflicts';
}

export interface TripConstraintsListMeta {
  tripId: string;
  constraintsVersion: number;
  total: number;
  byType: Record<TripConstraintType, number>;
  byStatus: Partial<Record<TripConstraintStatus, number>>;
  conflictCount: number;
  pendingConfirmCount: number;
  /** 行程目的地国家码（如 IS）；无则省略 */
  countryCode?: string;
  /** Plan Studio 约束控制台分区（官方规则 / 用户约束 / 验证快照） */
  sections?: TripConstraintsListSection[];
}

export interface TripConstraintsListResponse {
  meta: TripConstraintsListMeta;
  items: TripConstraint[];
  /** 旅行决策合同读模型（目标、策略、自动化授权、冲突摘要） */
  contract: import('./travel-decision-contract.types').TravelDecisionContract;
}

export type ConstraintRefreshType = 'quick' | 'deep';

export interface TripConstraintChangePatch {
  constraintId: string;
  patch: Partial<{
    name: string;
    description: string;
    category: TripConstraintCategory;
    type: TripConstraintType;
    status: TripConstraintStatus;
    scope: TripConstraintScope;
    operator: TripConstraintOperator;
    value: unknown;
    unit: string;
    tolerance: unknown;
    priority: number;
    allowRelaxation: boolean;
    locked: boolean;
    visibility: TripConstraintVisibility;
  }>;
}

export interface TripConstraintImpactPreviewResponse {
  tripId: string;
  constraintsVersion: number;
  refreshType: ConstraintRefreshType;
  affectedDays?: number[];
  affectedItemIds?: string[];
  budgetDelta?: { amount: number; currency: string };
  conflictsBefore: {
    mustHandle: number;
    suggestAdjust: number;
    pendingConfirm: number;
  };
  conflictsAfter?: {
    mustHandle: number;
    suggestAdjust: number;
    pendingConfirm: number;
  };
  recommendations: string[];
  /** deep 刷新建议调用的下游端点 */
  suggestedFollowUp?: {
    endpoint: string;
    body?: Record<string, unknown>;
  };
  assessBefore?: TripConstraintAssessSummary;
  assessAfter?: TripConstraintAssessSummary;
  feasibilityBefore?: TripConstraintFeasibilitySnapshot;
  feasibilityAfter?: TripConstraintFeasibilitySnapshot;
  executeabilityDelta?: {
    scoreDelta?: number;
    mustHandleDelta?: number;
    suggestAdjustDelta?: number;
  };
  /** 决策沙盘结构化影响（§9） */
  structuredImpact?: import('../utils/constraint-impact-preview.util').ConstraintImpactStructuredPreview;
}

export interface TripConstraintAssessSummary {
  overallAverageScore: number;
  overallGrade: string;
  reasonableDays: number;
  hasIssuesDays: number;
  plannedDays: number;
}

export interface TripConstraintFeasibilitySnapshot {
  verdictStatus: string;
  canStartExecute: boolean;
  mustHandle: number;
  suggestAdjust: number;
  pendingConfirm: number;
  isStale?: boolean;
}

export interface UpdateConstraintsCommandResponse {
  tripId: string;
  command: 'UPDATE_CONSTRAINTS';
  applied: string[];
  constraintsVersion: number;
  constraints: import('../utils/constraints-metadata.util').ConstraintsMetaSnapshot;
  summary: import('./constraints-summary.types').ConstraintsSummaryResponse;
  recalcRecommended: boolean;
  recalc?: {
    request_id: string;
    status?: string;
    has_comparison: boolean;
  };
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
  conflicts: import('./planning-conflicts.types').PlanningConflictItem[];
  canStartExecute?: boolean;
  gateExecute?: import('./trip-constraint-solver.types').GateExecuteStatusDto;
  /** 与 GET contract.conflicts 对齐的摘要（冲突沙盘） */
  contractConflicts?: import('./travel-decision-contract.types').TravelDecisionContractConflictSummary;
}

export interface TripConstraintRepairResponse {
  tripId: string;
  issueId?: string;
  /** 与 issue 关联的约束卡片 ID（高亮官方规则 / POI 规则） */
  relatedConstraintIds?: string[];
  blockerId?: string;
  blockerMessage?: string;
  options: import('../../readiness/types/coverage-map.types').RepairOption[];
  guardianNegotiation?: unknown;
  cascadeUiHints?: unknown[];
}

/** trip.metadata 扩展 */
export interface TripConstraintMetadataExtension {
  unifiedConstraints?: StoredUnifiedConstraint[];
  disabledConstraintIds?: string[];
  legacyConstraintLocks?: Record<string, boolean>;
  travelDecisionContract?: import('./travel-decision-contract.types').StoredTravelDecisionContract;
}
