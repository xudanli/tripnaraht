/**
 * AI Native Travel Status · 前端类型
 * 复制到前端：`src/api/travel-status.types.ts`
 */

export type TravelExecutabilityStatus = 'READY' | 'NEEDS_ATTENTION' | 'BLOCKED';

export interface TravelExecutabilityView {
  status: TravelExecutabilityStatus;
  headline: string;
  openDecisionCount: number;
  blockingCount: number;
  pendingVerificationCount: number;
}

export interface EffectivePlanSummaryView {
  versionId?: string;
  dayCount: number;
  lastUpdatedAt?: string;
  hasEffectivePlan: boolean;
}

export interface ConsumerDecisionRecommendation {
  title: string;
  summary?: string;
  keeps: string[];
  costs: string[];
  recommendedActionId?: string;
}

export interface ConsumerDecisionRepairOption {
  optionId: string;
  title: string;
  summary?: string;
  preserves: string[];
  sacrifices: string[];
  canApply: boolean;
  changePreview?: {
    remove?: { activityId?: string; title: string; lastEntryAt?: string; lastEntryAtLabel?: string };
    add?: { activityId?: string; title: string; lastEntryAt?: string; lastEntryAtLabel?: string };
    shortenMinutes?: number;
  };
  scheduleContext?: {
    projectedEta?: string;
    projectedEtaLabel?: string;
    nextLastEntryAt?: string;
    nextLastEntryAtLabel?: string;
    slipMinutes?: number;
    travelDurationMinutes?: number;
    timezone?: string;
  };
}

export interface ConsumerDecisionActions {
  acceptRecommended: { enabled: boolean; actionId?: string };
  keepOriginal: { enabled: boolean; actionId?: string };
  viewAlternatives: { enabled: boolean; count: number };
  defer: { enabled: boolean; actionId?: string };
}

export interface ConsumerDecisionEvidenceSummary {
  sourceLabel?: string;
  verifiedAt?: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
  freshness: 'FRESH' | 'STALE' | 'UNKNOWN';
}

/** 受影响的行程项（C 端展示用，含可读名称） */
export interface ConsumerAffectedActivity {
  activityId: string;
  title: string;
  dayIndex?: number;
}

export interface ConsumerDecisionItem {
  schemaId: string;
  problemId: string;
  headline: string;
  impact: string;
  explanation: string;
  severity: 'BLOCK' | 'CONFLICT' | 'VERIFY' | 'OPTIMIZE';
  affectedDayNumbers?: number[];
  affectedScopeLabel?: string;
  affectedActivities?: ConsumerAffectedActivity[];
  recommendation?: ConsumerDecisionRecommendation;
  /** 全部 allowed 修复候选 — 「查看其他方案」列表数据源 */
  repairOptions?: ConsumerDecisionRepairOption[];
  scheduleContext?: {
    projectedEta?: string;
    projectedEtaLabel?: string;
    nextLastEntryAt?: string;
    nextLastEntryAtLabel?: string;
    slipMinutes?: number;
    travelDurationMinutes?: number;
    timezone?: string;
  };
  actions: ConsumerDecisionActions;
  /** BLOCK 类决策 confirm 必填 — 与 unified options / preview 一致 */
  requiredAcknowledgements?: string[];
  evidenceSummary?: {
    sourceLabel?: string;
    verifiedAt?: string;
    confidence: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN';
    freshness: 'FRESH' | 'STALE' | 'UNKNOWN';
  };
}

export interface ConsumerDecisionQueueView {
  schemaId: string;
  tripId: string;
  generatedAt: string;
  headline: string;
  openCount: number;
  items: ConsumerDecisionItem[];
}

export interface TravelStatusView {
  schemaId: string;
  tripId: string;
  generatedAt: string;
  executability: TravelExecutabilityView;
  effectivePlan: EffectivePlanSummaryView;
  openDecisions: {
    count: number;
    headline: string;
    items: ConsumerDecisionItem[];
  };
  monitoring: {
    activeCount: number;
    items: Array<{
      kind: string;
      label: string;
      status: 'ACTIVE' | 'PENDING' | 'PAUSED' | 'ALERT';
      lastCheckedAt?: string;
      nextCheckAt?: string;
      summary?: string;
    }>;
  };
  automation: {
    defaultLevel: string;
    defaultLevelLabel: string;
    /** C 端展示档位；L0/L1 合并为 L0_L1 */
    uiLevel: AutomationUiLevel;
    uiLevelLabel: string;
    /** 概览 Tab 计数 — 从 catalog 聚合 */
    tierCounts: AutomationTierCounts;
    paused: boolean;
    scope: 'TRIP' | 'USER_TEMPLATE';
    /** C 端权限展示 SSOT — 控制台 automation 区块仅渲染此项或隐藏 */
    catalog: AutomationCatalogSummary;
  };
  aiCompletedWork: {
    recentCount: number;
    items: Array<{
      activityId: string;
      occurredAt: string;
      summary: string;
      changeSummary?: string;
      kind: string;
      problemId?: string;
      automatic: boolean;
      reversible: boolean;
      undo?: {
        enabled: boolean;
        logId?: string;
        undoActionId?: string;
      };
      status?: 'APPLIED' | 'ROLLED_BACK';
    }>;
  };
  pendingVerification: {
    count: number;
    items: Array<{
      problemId: string;
      headline: string;
      affectedDayNumbers?: number[];
    }>;
  };
  contextSnapshot: {
    snapshotId: string;
    revision: string;
    constraintsVersion: number;
    effectivePlanVersionId?: string;
    detailHref: string;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export type AutomationAuthorizationScope = 'TRIP' | 'USER_TEMPLATE';

export type AutomationUiLevel = 'L0_L1' | 'L2' | 'L3' | 'L4';

export type AutomationLevel =
  | 'INFORM_ONLY'
  | 'SUGGEST'
  | 'AUTO_REPAIR_LOW_RISK'
  | 'AUTO_EXECUTE_CONDITIONAL';

/** UI 档位 ↔ 后端 defaultLevel（L0/L1 无后端差异，合并展示） */
export const AUTOMATION_UI_LEVEL_MAP: ReadonlyArray<{
  uiLevel: AutomationUiLevel;
  uiLabel: string;
  defaultLevel: AutomationLevel;
  behavior: string;
}> = [
  {
    uiLevel: 'L0_L1',
    uiLabel: '观察与提醒',
    defaultLevel: 'INFORM_ONLY',
    behavior: '只更新事实与提醒，不改行程',
  },
  {
    uiLevel: 'L2',
    uiLabel: '建议执行',
    defaultLevel: 'SUGGEST',
    behavior: '出方案，改行程需确认（推荐默认）',
  },
  {
    uiLevel: 'L3',
    uiLabel: '边界内自动执行',
    defaultLevel: 'AUTO_REPAIR_LOW_RISK',
    behavior: '低风险自动修复',
  },
  {
    uiLevel: 'L4',
    uiLabel: '高度自主',
    defaultLevel: 'AUTO_EXECUTE_CONDITIONAL',
    behavior: '满足 catalog + 执行条件时自动 apply',
  },
] as const;

export interface AutomationTierCounts {
  auto: number;
  ask: number;
  deny: number;
}

export interface AutomationCatalogSummary {
  schemaId: 'tripnara.automation_authorization_summary@v1';
  coldStartActionKeys: string[];
  groups: Array<{
    group: string;
    label: string;
    autoCount: number;
    askCount: number;
    denyCount: number;
    actions: Array<{
      key: string;
      label: string;
      effectiveTier: string;
      effectiveTierLabel: string;
      defaultTier: string;
      coldStart: boolean;
      userOverride?: string;
    }>;
  }>;
}

export type AutomationPermissionTier = 'AUTO' | 'ASK' | 'DENY';

export interface UserAutomationAuthorizationTemplate {
  schemaId: 'tripnara.user_automation_authorization_template@v1';
  updatedAt: string;
  automationPaused?: boolean;
  automation?: {
    defaultLevel?: string;
    actionOverrides?: Record<string, string>;
    executionConditions?: Record<string, Record<string, unknown>>;
  };
  changeStrategy?: {
    archetype?: string;
    tolerances?: Record<string, unknown>;
  };
  teamGovernance?: Record<string, unknown>;
}

export interface AutomationAuthorizationView {
  schemaId: 'tripnara.automation_authorization_view@v1';
  tripId: string;
  generatedAt: string;
  scope: AutomationAuthorizationScope;
  constraintsVersion: number;
  automationPaused: boolean;
  contract: Record<string, unknown>;
  travelStatus: Pick<
    TravelStatusView,
    'automation' | 'aiCompletedWork' | 'monitoring' | 'openDecisions'
  >;
  userTemplate?: UserAutomationAuthorizationTemplate;
}

export interface AcceptRecommendedResponse {
  submit: { problemId: string; status: string; resolutionId?: string };
  apply?: { problemId: string; revalidation?: { status: string; message?: string } };
}

/** POST /api/trips/:tripId/execution/departure-slip —「我晚了」上报 */
export type DepartureSlipSource = 'USER_REPORT' | 'MOBILE_PRESENCE' | 'SYSTEM_INFERENCE';

export interface DepartureSlipRequest {
  /** 当前仍所在、即将离开的活动 ID（不是下一站） */
  activityId: string;
  /** ISO8601 — 快捷选项须为 plannedDepartAt + delayMinutes，勿用 new Date() */
  observedAt: string;
  stillAtPoi: boolean;
  source: DepartureSlipSource;
  idempotencyKey?: string;
}

export type DepartureSlipStatus = 'RECORDED' | 'NO_ACTION';

export interface DepartureSlipResponse {
  observationId: string;
  status: DepartureSlipStatus;
  /** status=RECORDED 时返回，用于跳转 decision-queue */
  problemId?: string;
  runId?: string;
}

export interface AcceptRecommendedRequest {
  actionId?: string;
  /** BLOCK 决策必填 — 例：「我确认在了解阻断原因后仍执行该方案」 */
  acknowledgement?: string[];
}

export interface TripContextSnapshotBindings {
  constraintsVersion: number;
  effectivePlanVersionId?: string;
  worldSnapshotId: string;
  dataCompletenessScore: number;
}

export interface TripContextSnapshotView {
  schemaId: string;
  snapshotId: string;
  revision: string;
  tripId: string;
  createdAt: string;
  tripUpdatedAt: string;
  bindings: TripContextSnapshotBindings;
  goal: {
    rankedPrinciples: string[];
    rawUserIntent?: string;
    destination: string;
    startDate: string;
    endDate: string;
    durationDays: number;
    tripStatus?: string | null;
  };
  members: {
    count: number;
    travelers: unknown[];
  };
  preferences: {
    tripScoped: Record<string, unknown>;
    userScopedAvailable: boolean;
  };
  contract: {
    objectives: { rankedPrinciples: string[]; version: number };
    changeStrategy: { archetype: string };
    /** C 端勿用 contract.automation 渲染权限；请读 travel-status / automation-authorization BFF */
    automation: {
      defaultLevel: string;
    };
  };
  openDecisions: {
    count: number;
    blockingCount: number;
    actionableCount: number;
    problemIds: string[];
  };
  uncertainties: Array<{
    problemId: string;
    headline: string;
    affectedDayNumbers?: number[];
  }>;
  effectivePlan: {
    versionId?: string;
    dayCount: number;
    itemCount: number;
    hasEffectivePlan: boolean;
  };
  budget?: {
    currency?: string;
    total?: number;
    style?: string;
  };
  decisionHistory: Array<{
    resolutionId: string;
    problemId: string;
    selectedActionId: string;
    status: string;
    decidedAt: string;
  }>;
}

export type TripIntentKind =
  | 'PLAN_TRIP'
  | 'MODIFY_ITINERARY'
  | 'FEASIBILITY_CHECK'
  | 'WEATHER_RISK'
  | 'SWAP_LODGING'
  | 'SWAP_ACTIVITY'
  | 'DECISION_STATUS'
  | 'GENERAL_QUERY';

export interface TripIntentRouteResult {
  schemaId: string;
  tripId: string;
  message: string;
  generatedAt: string;
  classification: {
    kind: TripIntentKind;
    confidence: number;
    matchedRule: string;
    triggerKind: string;
    routeTargetHint: string;
  };
  contextSnapshot: {
    snapshotId: string;
    revision: string;
    constraintsVersion: number;
    effectivePlanVersionId?: string;
  };
  suggestedAction:
    | 'CALL_ROUTE_AND_RUN'
    | 'OPEN_DECISION_QUEUE'
    | 'REVIEW_DISPATCH_RESULT'
    | 'NONE';
  decisionQueueHeadline?: string;
  openDecisionCount?: number;
  dispatch?: unknown;
}

export type AiActivityFilter =
  | 'ALL'
  | 'AUTO'
  | 'WAITING_CONFIRM'
  | 'WRITTEN_BACK'
  | 'CANCELLED';

export type AiActivityCategory =
  | 'MONITORING'
  | 'TIME_ROUTE'
  | 'ACTIVITY'
  | 'BUDGET_BOOKING'
  | 'SAFETY'
  | 'TEAM_PRIVACY'
  | 'VALIDATION'
  | 'OTHER';

export interface AiActivityLogSummary {
  todayActionCount: number;
  todayActionDelta: number;
  autoCompletedCount: number;
  autoCompletedPct: number;
  waitingConfirmCount: number;
  waitingConfirmPct: number;
  latestRevalidation?: {
    activityId: string;
    occurredAt: string;
    title: string;
    feasibilityBefore?: number;
    feasibilityAfter?: number;
  };
}

export interface AiActivityTimelineItem {
  activityId: string;
  eventId: string;
  occurredAt: string;
  category: AiActivityCategory;
  categoryLabel: string;
  filterTags: AiActivityFilter[];
  statusTag: string;
  statusLabel: string;
  title: string;
  reason: string;
  problemId?: string;
  automatic: boolean;
  reversible: boolean;
  actions: {
    viewEvidence: { enabled: boolean; href?: string };
    viewDiff: { enabled: boolean; href?: string };
    viewPlan: { enabled: boolean; href?: string };
  };
  detailHref: string;
}

export interface AiActivityLogView {
  schemaId: 'tripnara.ai_activity_log@v1';
  tripId: string;
  generatedAt: string;
  summary: AiActivityLogSummary;
  filters: AiActivityFilter[];
  items: AiActivityTimelineItem[];
}

export interface AiActivityLogDetailView {
  schemaId: 'tripnara.ai_activity_log_detail@v1';
  tripId: string;
  activityId: string;
  eventId: string;
  occurredAt: string;
  statusTag: string;
  statusLabel: string;
  title: string;
  executionReason: string;
  evidence: Array<{ label: string; detail?: string; updatedAt?: string }>;
  impactMetrics?: {
    feasibilityScore?: { before?: number; after?: number };
    riskLevel?: { before?: string; after?: string };
  };
  confirmedBy?: { userId: string; displayName?: string };
  reversible: boolean;
  undo?: { enabled: boolean; logId?: string; undoActionId?: string };
}
