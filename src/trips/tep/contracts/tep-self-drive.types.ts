/**
 * TripNARA Travel Execution Planning — Self-Drive Profile
 * Schema: tripnara/tep_self_drive@v1
 * @see internal-docs/product/TEP-SELF-DRIVE-PHASE0-ENGINEERING-CONTRACT.md
 */

export const TEP_SELF_DRIVE_SCHEMA = 'tripnara/tep_self_drive@v1' as const;
export const EXECUTABILITY_ASSESSMENT_SCHEMA =
  'tripnara/executability_assessment@v1' as const;
export const RECOVERY_GRAPH_SCHEMA = 'tripnara/recovery_graph@v1' as const;

export type PlanImportance = 'MANDATORY' | 'RECOMMENDED' | 'OPTIONAL';
export type PlanFlexibility = 'FIXED' | 'MOVABLE' | 'REPLACEABLE' | 'REMOVABLE';

export type RuleOutcome =
  | 'PASS'
  | 'CAUTION'
  | 'NEED_CONFIRM'
  | 'SUGGEST_REPAIR'
  | 'REJECT'
  | 'UNKNOWN';

export type RuleSeverity =
  | 'INFO'
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL';

export type ExecutabilityStatus =
  | 'EXECUTABLE'
  | 'EXECUTABLE_WITH_CAUTION'
  | 'REQUIRES_CONFIRMATION'
  | 'REQUIRES_REPAIR'
  | 'NOT_EXECUTABLE'
  | 'UNKNOWN';

export type DriveLoadTier = 'LOW' | 'MEDIUM' | 'HIGH' | 'EXTREME';

export interface EvidenceRef {
  assertionId?: string;
  provider: string;
  sourceType: 'OFFICIAL' | 'PARTNER' | 'USER' | 'MODEL' | 'INTERNAL';
  observedAt: string;
  validUntil?: string;
  subjectRef?: string;
  predicate?: string;
  confidence?: number;
  degraded?: boolean;
}

export interface SuggestedAction {
  actionId: string;
  label: string;
  deepLink?: string;
}

export interface PlanningRuleResult {
  ruleId: string;
  outcome: RuleOutcome;
  severity: RuleSeverity;
  affectedRefs: string[];
  explanation: string;
  evidenceRefs: EvidenceRef[];
  suggestedActions?: SuggestedAction[];
  degraded?: boolean;
  degradationReason?: string;
}

/** 车型来源 — PACK_DEFAULT 不得产出确定性 F-road 准入结论 */
export type VehicleSource =
  | 'USER_DECLARED'
  | 'GUIDE'
  | 'EXPLORATION'
  | 'TRIP_METADATA'
  | 'PACK_DEFAULT'
  | 'UNKNOWN';

export interface VehicleProfile {
  vehicleType: '2WD' | '4WD' | 'AWD' | 'CAMPERVAN' | 'OTHER';
  vehicleSource: VehicleSource;
  drivetrain?: string;
  fuelType?: 'PETROL' | 'DIESEL' | 'EV' | 'HYBRID';
  transmission?: 'MANUAL' | 'AUTOMATIC';
}

export interface DriverProfile {
  driverId: string;
  experienceLevel: 'NOVICE_ABROAD' | 'INTERMEDIATE' | 'EXPERIENCED';
  maxContinuousDriveMinutes?: number;
}

export interface DrivingPolicy {
  maxDailyDriveMinutes?: number;
  nightDrivingAllowed: boolean;
  nightDrivingPreference: 'AVOID' | 'ALLOW_WITH_CAUTION' | 'ALLOW';
  maxConsecutiveHighLoadDays?: number;
  /** 不夜驾：日落后允许继续驾驶的分钟数（默认 30） */
  maxMinutesAfterSunset?: number;
}

export interface RentalRestriction {
  code: string;
  description: string;
  source: 'RENTAL_CONTRACT' | 'PACK_DEFAULT' | 'USER_DECLARED';
}

export interface SelfDriveProfile {
  vehicle: VehicleProfile;
  drivers: DriverProfile[];
  drivingPolicy: DrivingPolicy;
  rentalRestrictions?: RentalRestriction[];
}

export interface RouteAnchor {
  ref: string;
  placeId?: string;
  lat?: number;
  lng?: number;
  label: string;
}

export interface DriveLeg {
  legId: string;
  fromRef: string;
  toRef: string;
  baseNavigationMinutes: number;
  adjustedMinutes?: number;
  roadRefs: string[];
  importance: PlanImportance;
  flexibility: PlanFlexibility;
}

export interface AccommodationAnchor {
  ref: string;
  checkInFrom?: string;
  latestArrival?: string;
  parkingRequired?: boolean;
}

export interface PlannedActivity {
  ref: string;
  importance: PlanImportance;
  flexibility: PlanFlexibility;
  weatherSensitive: boolean;
  reservationRequired: boolean;
  durationMinutes: number;
  bufferMinutes: number;
  fixedStartAt?: string;
  /** SDR-302 — 规划期预计算室内/天气安全备选（WP-TEP-14） */
  weatherFallbackRef?: string;
  weatherFallbackPoiId?: string;
}

export interface PlanningBuffer {
  ref: string;
  kind: 'TRANSIT' | 'REST' | 'FUEL' | 'FLEX';
  minutes: number;
}

export interface DailyDrivePlan {
  date: string;
  dayIndex: number;
  origin: RouteAnchor;
  destination: RouteAnchor;
  legs: DriveLeg[];
  accommodation?: AccommodationAnchor;
  activities: PlannedActivity[];
  buffers: PlanningBuffer[];
}

export interface ValidationFinding {
  findingId: string;
  ruleId: string;
  outcome: RuleOutcome;
  severity: RuleSeverity;
  message: string;
  affectedRefs: string[];
}

export interface ExecutabilityAssessment {
  schemaId: typeof EXECUTABILITY_ASSESSMENT_SCHEMA;
  status: ExecutabilityStatus;
  findings: ValidationFinding[];
  ruleResults: PlanningRuleResult[];
  score?: number;
  evidenceRefs: EvidenceRef[];
  evaluatedAt: string;
  planVersionRef?: string;
  packId: string;
  packVersion: string;
}

export interface PlanDependency {
  fromRef: string;
  toRef: string;
  kind: 'TEMPORAL' | 'ROUTING' | 'ACCOMMODATION' | 'RESERVATION';
  description?: string;
}

export interface RecoveryOption {
  optionId: string;
  triggerRuleId?: string;
  action: 'REMOVE' | 'REPLACE' | 'SHIFT' | 'REROUTE';
  targetRefs: string[];
  description: string;
  /** REPLACE only — 预计算备选 activity ref（规划期 RecoveryGraph） */
  replacementRef?: string;
  /** REPLACE only — 物化 substitutePoiId（禁止运行时 LLM 搜 POI） */
  replacementPoiId?: string;
}

export interface DependencyImpactSummary {
  nodeRef: string;
  editable: boolean;
  downstreamRefs: string[];
  dependencyKinds: PlanDependency['kind'][];
}

export interface RecoveryGraph {
  schemaId: typeof RECOVERY_GRAPH_SCHEMA;
  removableNodes: string[];
  replaceableNodes: string[];
  movableNodes: string[];
  protectedNodes: string[];
  dependencies: PlanDependency[];
  fallbackOptions: RecoveryOption[];
  /** SDR-303 — 可编辑节点依赖影响摘要 */
  dependencyImpacts?: DependencyImpactSummary[];
}

export type TriggerType =
  | 'WEATHER_THRESHOLD'
  | 'ROAD_STATUS_CHANGE'
  | 'EXECUTION_SLIP'
  | 'RESERVATION_DEADLINE'
  | 'SUPPLY_THRESHOLD';

export type DecisionPolicy =
  | 'AUTO_SUGGEST_REPAIR'
  | 'REQUIRE_USER_CONFIRMATION'
  | 'BLOCK_UNTIL_RESOLVED';

/** WP-TEP-11 — 证据刷新策略 */
export type HookEvidencePolicy = 'REFRESH_ON_STALE' | 'REQUIRE_OFFICIAL' | 'ALLOW_DEGRADED';

export interface TriggerCondition {
  metric: string;
  operator: '>' | '>=' | '<' | '<=' | '==' | 'IN';
  value: number | string | string[];
  unit?: string;
}

export interface DecisionHook {
  hookId: string;
  targetRef: string;
  triggerType: TriggerType;
  /** 监测指标（与 triggerCondition.metric 对齐） */
  sourceMetric?: string;
  triggerCondition: TriggerCondition;
  leadTime: string;
  /** 影响范围 — 与 affectedRefs 同义 */
  impactScope: string[];
  defaultPolicy: DecisionPolicy;
  semanticKey?: string;
  evidencePolicy?: HookEvidencePolicy;
}

export type ExecutabilityStripLevel = 'success' | 'warning' | 'danger' | 'neutral';

export interface ExecutabilityAssessmentUi {
  status: ExecutabilityStatus;
  statusLabel: string;
  stripLevel: ExecutabilityStripLevel;
  canCommit: boolean;
  primaryCta: { label: string; deepLink: string };
}
