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
}

export interface TripConstraintSource {
  type: TripConstraintSourceType;
  sourceId?: string;
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
}

export interface TripConstraintsListSection {
  key: string;
  label: string;
  /** 该分区下的 constraintId 顺序（前端直接按 id 渲染） */
  constraintIds: string[];
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
}
