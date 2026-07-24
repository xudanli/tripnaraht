/**
 * @tripnara/execution-risk-contracts — frozen read surface for Execution Risk Center V1.1.
 * Source of truth: docs/TripNARA-Execution-Risk-Backend-Package-V1/03_CONTRACTS/execution-risk-contracts-v1.ts
 *
 * Regenerate: npm run contracts:execution-risk
 */

// TripNARA Execution Risk Contracts V1.1
// Generated: 2026-07-09
// Status: DRAFT — Sprint 0A Package Consistency Resolution applied
// Authority: PACKAGE_CONSISTENCY_RESOLUTION_V1.md
// Changelog v1.1: Four adjustment card types vs seven action categories; member scope split; refresh/query ports

// ═══════════════════════════════════════════
// ENUMS
// ═══════════════════════════════════════════

export enum ActiveRiskType {
  ENVIRONMENT = 'ENVIRONMENT',
  ROAD_TRANSPORT = 'ROAD_TRANSPORT',
  MEMBER_STATE = 'MEMBER_STATE',
  ROUTE_EXECUTION = 'ROUTE_EXECUTION',
  SCHEDULE = 'SCHEDULE',
  BOOKING_FULFILLMENT = 'BOOKING_FULFILLMENT',
  TEAM_COORDINATION = 'TEAM_COORDINATION',
  RESOURCE = 'RESOURCE',
}

export enum ExecutionRiskSeverity {
  AT_RISK = 'AT_RISK',
  REPLAN_REQUIRED = 'REPLAN_REQUIRED',
  STOP = 'STOP',
}

export enum RequiredAction {
  MONITOR = 'MONITOR',
  ADVISE = 'ADVISE',
  REPLAN = 'REPLAN',
  STOP_AND_ACT = 'STOP_AND_ACT',
}

/** 调整卡片类型（四类）— 用户需要处理什么问题 */
export enum AdjustmentItemType {
  SAFETY_INTERVENTION = 'SAFETY_INTERVENTION',
  DYNAMIC_REPLAN = 'DYNAMIC_REPLAN',
  TEAM_COORDINATION = 'TEAM_COORDINATION',
  EXECUTION_PREPARATION = 'EXECUTION_PREPARATION',
}

/** 方案动作类别（七类）— 推荐方案具体使用了哪些调整动作 */
export enum InterventionActionCategory {
  TIME = 'TIME',
  ROUTE = 'ROUTE',
  ACTIVITY = 'ACTIVITY',
  BOOKING = 'BOOKING',
  TEAM = 'TEAM',
  TRANSPORT = 'TRANSPORT',
  EMERGENCY = 'EMERGENCY',
}

export enum RiskGenerationMode {
  DIRECT_DETECTION = 'DIRECT_DETECTION',
  CAUSAL_DERIVATION = 'CAUSAL_DERIVATION',
  PLAN_SIMULATION = 'PLAN_SIMULATION',
  PROJECTION_ONLY = 'PROJECTION_ONLY',
}

export enum RiskCapabilityStatus {
  CATALOG_ONLY = 'CATALOG_ONLY',
  RULE_DEFINED = 'RULE_DEFINED',
  HARNESS_READY = 'HARNESS_READY',
  PRODUCTION_ACTIVE = 'PRODUCTION_ACTIVE',
}

export enum RiskRefreshTriggerType {
  WORLD_FACT_UPDATE = 'WORLD_FACT_UPDATE',
  SCHEDULED_MONITOR = 'SCHEDULED_MONITOR',
  PLAN_VERSION_CHANGED = 'PLAN_VERSION_CHANGED',
  MEMBER_STATE_CHANGED = 'MEMBER_STATE_CHANGED',
  BOOKING_STATUS_CHANGED = 'BOOKING_STATUS_CHANGED',
  MANUAL_REFRESH = 'MANUAL_REFRESH',
  INTERNAL_COMMAND = 'INTERNAL_COMMAND',
}

export enum MemberImpactType {
  SAFETY_EXPOSURE = 'SAFETY_EXPOSURE',
  FATIGUE_INCREASED = 'FATIGUE_INCREASED',
  FATIGUE_REDUCED = 'FATIGUE_REDUCED',
  DELAYED = 'DELAYED',
  BLOCKED = 'BLOCKED',
  ACTIVITY_REMOVED = 'ACTIVITY_REMOVED',
  EXPERIENCE_REDUCED = 'EXPERIENCE_REDUCED',
  EXPERIENCE_IMPROVED = 'EXPERIENCE_IMPROVED',
  BOOKING_AT_RISK = 'BOOKING_AT_RISK',
  SEPARATED_FROM_TEAM = 'SEPARATED_FROM_TEAM',
  ADDITIONAL_RESPONSIBILITY = 'ADDITIONAL_RESPONSIBILITY',
}

export enum MemberImpactDirection {
  POSITIVE = 'POSITIVE',
  NEGATIVE = 'NEGATIVE',
  NEUTRAL = 'NEUTRAL',
}

export enum MemberImpactDegree {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
}

export enum AffectedMembersScope {
  ALL_MEMBERS = 'ALL_MEMBERS',
  FOCUSED = 'FOCUSED',
}

export enum RecommendationType {
  RECOMMENDED = 'RECOMMENDED',
  CONSERVATIVE = 'CONSERVATIVE',
  MINIMAL_CHANGE = 'MINIMAL_CHANGE',
  UNAVAILABLE = 'UNAVAILABLE',
}

export enum RecommendationStatus {
  DRAFT = 'DRAFT',
  PRESENTED = 'PRESENTED',
  APPLIED = 'APPLIED',
  CONFIRMED = 'CONFIRMED',
  REJECTED = 'REJECTED',
  SUPERSEDED = 'SUPERSEDED',
}

export enum ExecutionMode {
  SUGGEST_ONLY = 'SUGGEST_ONLY',
  CONFIRM_BEFORE_WRITE = 'CONFIRM_BEFORE_WRITE',
  AUTO_WRITE_REVERSIBLE = 'AUTO_WRITE_REVERSIBLE',
  EMERGENCY_GUIDANCE = 'EMERGENCY_GUIDANCE',
}

export enum AutomationCapability {
  SHOW_INSTRUCTION = 'SHOW_INSTRUCTION',
  SEND_ALERT = 'SEND_ALERT',
  UPDATE_PLAN = 'UPDATE_PLAN',
  UPDATE_NAVIGATION = 'UPDATE_NAVIGATION',
  NOTIFY_TEAM = 'NOTIFY_TEAM',
  CONTACT_PROVIDER = 'CONTACT_PROVIDER',
  CREATE_DRAFT = 'CREATE_DRAFT',
  EXTERNAL_TRANSACTION = 'EXTERNAL_TRANSACTION',
}

export enum ProjectionSource {
  CURRENT_PLAN = 'CURRENT_PLAN',
  RECOMMENDATION_PREVIEW = 'RECOMMENDATION_PREVIEW',
  CONFIRMED_PLAN = 'CONFIRMED_PLAN',
}

export enum KnowledgeStatus {
  DRAFT = 'DRAFT',
  RESEARCH_VALIDATED = 'RESEARCH_VALIDATED',
  DESTINATION_VALIDATED = 'DESTINATION_VALIDATED',
  PRODUCTION_ACTIVE = 'PRODUCTION_ACTIVE',
  DEPRECATED = 'DEPRECATED',
}

export enum SeverityRuleOperator {
  GTE = 'GTE',
  GT = 'GT',
  LTE = 'LTE',
  LT = 'LT',
  BETWEEN = 'BETWEEN',
  EQ = 'EQ',
}

export enum CascadeRecovery {
  AUTO_CLEAR = 'AUTO_CLEAR',
  VERIFY_REQUIRED = 'VERIFY_REQUIRED',
  PERSIST = 'PERSIST',
}

export enum MetricId {
  WIND_SUSTAINED_MPS = 'WIND_SUSTAINED_MPS',
  WIND_GUST_MPS = 'WIND_GUST_MPS',
  WIND_CROSS_MPS = 'WIND_CROSS_MPS',
  PRECIPITATION_RATE_MMH = 'PRECIPITATION_RATE_MMH',
  PRECIPITATION_ACCUM_MM = 'PRECIPITATION_ACCUM_MM',
  SNOWFALL_RATE_CMH = 'SNOWFALL_RATE_CMH',
  TEMPERATURE_C = 'TEMPERATURE_C',
  WIND_CHILL_C = 'WIND_CHILL_C',
  WBGT_C = 'WBGT_C',
  VISIBILITY_M = 'VISIBILITY_M',
  AQI = 'AQI',
  LIGHTNING_INTERVAL_S = 'LIGHTNING_INTERVAL_S',
  WATER_DEPTH_CM = 'WATER_DEPTH_CM',
  WATER_FLOW_MPS = 'WATER_FLOW_MPS',
  AVALANCHE_LEVEL = 'AVALANCHE_LEVEL',
  VOLCANIC_COLOR_CODE = 'VOLCANIC_COLOR_CODE',
  EARTHQUAKE_MMI = 'EARTHQUAKE_MMI',
  DRIVING_HOURS_CONTINUOUS = 'DRIVING_HOURS_CONTINUOUS',
  DRIVING_HOURS_DAILY = 'DRIVING_HOURS_DAILY',
  SCHEDULE_DELAY_MIN = 'SCHEDULE_DELAY_MIN',
  FUEL_PERCENT = 'FUEL_PERCENT',
  EV_BATTERY_PERCENT = 'EV_BATTERY_PERCENT',
  LAKE_LOUISE_SCORE = 'LAKE_LOUISE_SCORE',
}

// ═══════════════════════════════════════════
// CORE DOMAIN OBJECTS
// ═══════════════════════════════════════════

export interface ActiveRisk {
  riskId: string;
  tripId: string;
  canonicalCode: string;
  knowledgeCode: string;
  riskType: ActiveRiskType;
  severity: ExecutionRiskSeverity;
  requiredAction: RequiredAction;
  sourceEventId?: string;
  sourceEventType?: string;
  detectedAt: string;                    // ISO 8601
  validFrom?: string;
  validTo?: string;
  matchedRuleId?: string;
  metricValue?: number;
  metricUnit?: string;
  isRootCause: boolean;
  causalParentId?: string;
  spatialCellId?: string;
  affectedActivityIds: string[];
  affectedMemberIds: string[];
  status: 'ACTIVE' | 'RESOLVED' | 'SUPPRESSED' | 'PENDING_VERIFICATION';
  resolvedAt?: string;
  resolvedBy?: string;                   // cluster or manual
  clusterId?: string;
  engineId: string;
  planVersionId: string;
  projectionSource: ProjectionSource;
}

export interface ExecutionAlert {
  alertId: string;
  tripId: string;
  riskId: string;
  clusterId?: string;
  severity: ExecutionRiskSeverity;
  requiredAction: RequiredAction;
  title: string;
  summary: string;
  reasonTags: string[];
  affectedTimeRange?: { from: string; to: string };
  affectedActivityIds: string[];
  generatedAt: string;
  readAt?: string;
  dismissedAt?: string;
}

export interface ExecutionRiskCluster {
  clusterId: string;
  tripId: string;
  clusterKey: RiskClusterKey;
  primaryRiskId: string;
  riskIds: string[];
  suppressedRiskIds: string[];
  suppressedDecisionIds: string[];
  severity: ExecutionRiskSeverity;
  causalChain: CausalChainView;
  adjustmentQueueItems: AdjustmentQueueItem[];
  rootCauseCleared: boolean;
  rootCauseClearedAt?: string;
  pendingVerificationRiskIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface RiskClusterKey {
  rootEventId?: string;
  rootCauseFamily: string;
  spatialCellId?: string;
  timeBucket: string;
  affectedRouteSegmentIds?: string[];
}

export interface AdjustmentQueueItem {
  itemId: string;
  clusterId: string;
  /** 四类调整卡 — 描述用户需要处理的问题类型 */
  type: AdjustmentItemType;
  title: string;
  description: string;
  affectedMembersScope: AffectedMembersScope;
  affectedMemberIds: string[];
  recommendations: ExecutionRiskRecommendation[];
  consequenceImpacts?: RiskConsequenceImpact[];
  status: 'PENDING' | 'APPLIED' | 'CONFIRMED' | 'REJECTED' | 'AUTO_EXECUTED';
  appliedAt?: string;
  confirmedAt?: string;
}

export interface RecommendationInterventionAction {
  category: InterventionActionCategory;
  actionCode: string;
  label?: string;
  executionMode: ExecutionMode;
  capabilities: AutomationCapability[];
  reversibility: 'YES' | 'PARTIAL' | 'NO';
}

export interface ExecutionRiskRecommendation {
  recommendationId: string;
  clusterId: string;
  tripId: string;
  planType: RecommendationType;
  title: string;
  /** 七类动作组合 — 一张 SAFETY_INTERVENTION 卡可含 ROUTE + ACTIVITY + BOOKING + TEAM */
  actions: RecommendationInterventionAction[];
  status: RecommendationStatus;
  impactSummary: RecommendationImpact;
  /** 仅 FOCUSED scope 或方案预览需要逐人差异时填充；ALL_MEMBERS 不复制相同条目 */
  memberImpacts?: MemberImpact[];
  planDiff?: PlanDiff;
  experienceRetention?: number;
  safetyScore?: number;
  reversibility: 'YES' | 'PARTIAL' | 'NO';
  executionMode: ExecutionMode;
  capabilities: AutomationCapability[];
  presentedAt?: string;
  appliedAt?: string;
  confirmedAt?: string;
  ledgerRef?: string;
}

export interface RecommendationImpact {
  safetyDelta: number;                   // -2 to +2
  timeDeltaMinutes: number;
  fatigueDelta: number;                  // -2 to +2
  experienceDelta: number;               // -3 to +3
  budgetDeltaCurrency?: number;
  budgetCurrency?: string;
  bookingImpact: 'NONE' | 'NOTIFY' | 'RESCHEDULE' | 'CANCEL' | 'NEW_BOOKING';
}

export interface MemberImpact {
  memberId: string;
  memberName?: string;
  impactType: MemberImpactType;
  direction: MemberImpactDirection;
  degree: MemberImpactDegree;
  explanation: string;
}

export interface PlanDiff {
  beforePlanVersionId: string;
  afterPlanVersionId: string;
  addedActivities: PlanActivity[];
  removedActivities: PlanActivity[];
  modifiedActivities: { before: PlanActivity; after: PlanActivity }[];
  unchangedActivityIds: string[];
  timeDeltaMinutes: number;
  budgetDelta?: number;
}

export interface PlanActivity {
  activityId: string;
  type: string;
  name: string;
  location?: string;
  startAt?: string;
  endAt?: string;
  durationMinutes?: number;
  bookingId?: string;
  memberIds?: string[];
}

export interface PlanBPolicy {
  clusterId: string;
  triggerDescription: string;
  triggerMetrics?: { metric: MetricId; operator: SeverityRuleOperator; value: number }[];
  backupActionCodes: string[];
  backupActivityIds?: string[];
  autoSwitch: boolean;
  monitoringActive: boolean;
  monitoringIntervalMinutes?: number;
  lastEvaluatedAt?: string;
  activatedAt?: string;
}

export interface RiskConsequenceImpact {
  impactId: string;
  sourceRiskId: string;
  targetRiskId: string;
  impactType: string;
  description: string;
  severity: ExecutionRiskSeverity;
  causalLinkType: 'DIRECT' | 'DERIVED' | 'COMPOUND';
}

export interface RiskCausalChain {
  chainId: string;
  knowledgeCode: string;
  rootCause: CausalChainNode;
  nodes: CausalChainNode[];
  edges: CausalChainEdge[];
}

export interface CausalChainNode {
  nodeId: string;
  knowledgeCode: string;
  nodeType: 'ROOT_CAUSE' | 'DIRECT_IMPACT' | 'DERIVED_IMPACT' | 'DECISION_TRIGGER' | 'RESOLUTION';
  description: string;
  severityContribution?: ExecutionRiskSeverity;
}

export interface CausalChainEdge {
  fromNodeId: string;
  toNodeId: string;
  edgeType: 'CAUSES' | 'AMPLIFIES' | 'RESOLVES';
}

export interface CausalChainView {
  chainId: string;
  rootCauseDescription: string;
  nodes: { description: string; nodeType: string; isActive: boolean }[];
}

export interface RiskSourceRef {
  sourceType: 'ENVIRONMENT_EVENT' | 'ROAD_EVENT' | 'MEMBER_EVENT' | 'BOOKING_EVENT' | 'MANUAL';
  sourceId: string;
  sourceSystem?: string;
  detectedAt: string;
  confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface EvidenceReference {
  evidenceId: string;
  publisher: string;
  title: string;
  url: string;
  publicationDate?: string;
  accessedAt: string;
  jurisdiction?: string;
  evidenceGrade: 'A' | 'B' | 'C' | 'D';
  supportedRuleIds: string[];
  notes?: string;
}

// ═══════════════════════════════════════════
// KNOWLEDGE LAYER
// ═══════════════════════════════════════════

export interface CanonicalRiskDefinition {
  canonicalCode: string;
  knowledgeCode: string;
  riskType: ActiveRiskType;
  displayName: Record<string, string>;
  sourceAliases: string[];
  status: KnowledgeStatus;
  since: string;
  deprecatedBy?: string;
  isRootCause: boolean;
}

export interface SeverityRule {
  ruleId: string;
  knowledgeCode: string;
  level: ExecutionRiskSeverity;
  metric: MetricId;
  operator: SeverityRuleOperator;
  minValue?: number;
  maxValue?: number;
  unit: string;
  conditions: RuleCondition[];
  priority: number;
  destinationScope?: string[];
  activityScope?: string[];
  transportScope?: string[];
  memberScope?: MemberScope;
  validFrom?: string;
  validTo?: string;
  seasonalWindow?: SeasonalWindow;
  evidenceIds: string[];
}

export interface RuleCondition {
  conditionType: string;
  field: string;
  operator: SeverityRuleOperator;
  value: string | number | boolean;
  thresholdAdjustment?: {
    operator: 'ADD' | 'SUBTRACT' | 'MULTIPLY' | 'OVERRIDE';
    value: number;
  };
  levelOverride?: ExecutionRiskSeverity;
}

export interface MemberScope {
  ageGroups?: string[];
  declaredTraits?: Record<string, string>;
}

export interface SeasonalWindow {
  startMonth: number;
  endMonth: number;
  hemisphere: 'NORTH' | 'SOUTH' | 'BOTH';
}

export interface RecoveryRule {
  ruleId: string;
  knowledgeCode: string;
  recoveryMetric: MetricId;
  recoveryOperator: SeverityRuleOperator;
  recoveryValue: number;
  sustainedDurationMinutes: number;
  sustainedForecasts: number;
  hysteresisBuffer: number;
  cascadeRecovery: CascadeRecovery;
  verificationAction?: string;
}

export interface InterventionAction {
  actionCode: string;
  actionCategory: InterventionActionCategory;
  name: string;
  description: string;
  typicalUseCase: string;
  safetyImpact: number;
  timeImpactMinRange: { min: number; max: number };
  fatigueImpact: number;
  experienceImpact: number;
  budgetImpactDescription?: string;
  bookingImpact: string;
  reversibility: 'YES' | 'PARTIAL' | 'NO';
  userConfirmRequired: boolean;
  aiAutoExecutable: boolean;
  capabilities: AutomationCapability[];
  executionMode: ExecutionMode;
  applicableRiskCodes: string[];
}

export interface RiskCapabilityDefinition {
  canonicalCode: string;
  knowledgeCode: string;
  generationMode: RiskGenerationMode;
  sourceAdapter?: string;
  severityRuleIds?: string[];
  causalChainIds?: string[];
  harnessScenarioIds?: string[];
  capabilityStatus: RiskCapabilityStatus;
}

// ═══════════════════════════════════════════
// INTERNAL PORTS (not OpenAPI — implementation boundaries)
// ═══════════════════════════════════════════

/** 内部知识库 — Sprint 0B 不对外暴露 REST */
export interface ExecutionRiskKnowledgeRepository {
  findRiskDefinition(knowledgeCode: string): Promise<CanonicalRiskDefinition | null>;
  findSeverityRules(knowledgeCode: string): Promise<SeverityRule[]>;
  findCausalChains(knowledgeCode: string): Promise<RiskCausalChain[]>;
  findInterventionActions(actionCode: string): Promise<InterventionAction | null>;
  getActiveKnowledgeVersion(): Promise<{ version: string; status: KnowledgeStatus }>;
}

export interface RiskRefreshResult {
  tripId: string;
  snapshotId: string;
  planVersionId: string;
  refreshedAt: string;
  activeRiskCount: number;
  clusterCount: number;
}

/** GET 不得触发计算 — 仅 refresh 入口写入快照 */
export interface ActiveRiskRefreshService {
  refresh(input: {
    tripId: string;
    triggerType: RiskRefreshTriggerType;
    triggerRef?: string;
    expectedPlanVersionId?: string;
  }): Promise<RiskRefreshResult>;
}

export interface ActiveRiskQueryService {
  listCurrentRisks(tripId: string, opts?: { planVersionId?: string }): Promise<ActiveRisk[]>;
}

export interface CreatedPlanVersion {
  planVersionId: string;
  basePlanVersionId: string;
  createdAt: string;
}

/** 通用写端口 — RFC001 仅作 Adapter 实现来源，非领域接口名 */
export interface CanonicalPlanVersionWriter {
  createFromConfirmedRecommendation(input: {
    tripId: string;
    basePlanVersionId: string;
    recommendationId: string;
    planDiff: PlanDiff;
    decisionId: string;
    idempotencyKey: string;
  }): Promise<CreatedPlanVersion>;
}

export interface DecisionLedgerEntry {
  entryId: string;
  tripId: string;
  decisionId: string;
  recommendationId: string;
  planVersionId: string;
  recordedAt: string;
  recordedBy: string;
  payload: Record<string, unknown>;
}

export interface DecisionLedgerReference {
  ledgerRef: string;
  entryId: string;
}

export interface DecisionLedgerWriter {
  append(entry: DecisionLedgerEntry): Promise<DecisionLedgerReference>;
}

/** Feature flags — Legacy cutover (Harness 通过 ≠ 可删 Legacy) */
export interface ExecutionRiskFeatureFlags {
  EXECUTION_RISK_CANONICAL_ENABLED: boolean;
  EXECUTION_RISK_SHADOW_COMPARE_ENABLED: boolean;
  EXECUTION_RISK_LEGACY_FALLBACK_ENABLED: boolean;
  EXECUTION_RISK_CONFIRM_WRITE_ENABLED: boolean;
}

// ═══════════════════════════════════════════
// API REQUEST/RESPONSE
// ═══════════════════════════════════════════

export interface ExecutionRiskListResponse {
  tripId: string;
  clusters: ExecutionRiskCluster[];
  unclusteredRisks: ActiveRisk[];
  generatedAt: string;
  engineId: string;
  planVersionId: string;
}

export interface ApplyRecommendationRequest {
  recommendationId: string;
  idempotencyKey: string;
  requestedBy: string;
}

export interface ApplyRecommendationResponse {
  status: 'PREVIEW';
  recommendationId: string;
  planDiff: PlanDiff;
  projectedRisks: ActiveRisk[];
  requiresConfirmation: boolean;
}

export interface ConfirmRecommendationRequest {
  recommendationId: string;
  idempotencyKey: string;
  confirmedBy: string;
}

export interface ConfirmRecommendationResponse {
  status: 'CONFIRMED';
  recommendationId: string;
  newPlanVersionId: string;
  ledgerRef: string;
  updatedRisks: ActiveRisk[];
}

export interface CausalTraceResponse {
  interventionId: string;
  chainId: string;
  rootCause: CausalChainNode;
  trace: CausalChainNode[];
  evidenceRefs: string[];
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}
