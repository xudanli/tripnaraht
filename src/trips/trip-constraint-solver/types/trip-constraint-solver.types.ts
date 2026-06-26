/**
 * Constraint Solver dual-phase read models — aligned with frontend
 * `TripFeasibilityReportDto` / `TripExecutionAdvisoryDto`.
 */

import type { CoverageDisclosure } from '../../../travel-cognition';

export type FeasibilityVerdictStatus =
  | 'EXECUTABLE'
  | 'ADJUST_REQUIRED'
  | 'NOT_EXECUTABLE'
  | 'STALE'
  | 'UNKNOWN';

export type ExecutionVerdictStatus =
  | 'ON_TRACK'
  | 'AT_RISK'
  | 'REPLAN_REQUIRED'
  | 'STOP';

export type FeasibilityIssuePriority = 'must_handle' | 'suggest_adjust' | 'pending_confirm';

export type FeasibilityDimensionKey =
  | 'schedule'
  | 'transport'
  | 'booking'
  | 'environment'
  | 'team_fit'
  | 'itinerary_completeness';

export type FeasibilityDayStatus = 'ok' | 'warning' | 'blocked';

export type ExecutionItemStatus = 'completed' | 'active' | 'upcoming' | 'at_risk';

export type ExecutionActionType = 'shorten' | 'skip' | 'reroute' | 'replace' | 'keep';

export interface FeasibilityVerdictDto {
  status: FeasibilityVerdictStatus;
  headline: string;
  subheadline?: string;
}

export interface FeasibilityDimensionDto {
  key: FeasibilityDimensionKey;
  label: string;
  score: number;
  statusLabel: string;
  issueCount: number;
  blockerCount: number;
}

export interface FeasibilityDayTimelineDto {
  dayNumber: number;
  tripDayId: string;
  status: FeasibilityDayStatus;
  summary: string | null;
  issueIds: string[];
}

export interface FeasibilityProofDto {
  itemId?: string;
  fromItemId?: string;
  toItemId?: string;
  placeLabel?: string;
  entity: string;
  constraint: string;
  currentFact: string;
  evidenceSource: string;
  observedAt?: string;
  validUntil?: string;
  ruleId?: string;
  confidence?: number;
  evidenceType: string;
  conclusion: string;
  repairOptions?: FeasibilityRepairOptionDto[];
  planBOptions?: FeasibilityRepairOptionDto[];
}

export interface FeasibilityRepairOptionDto {
  id: string;
  label: string;
  description: string;
  impactSummary?: string;
  type?: string;
  actionType?: string;
  payload?: Record<string, unknown>;
}

export interface FeasibilityIssueAnchorsDto {
  fromItemId?: string;
  toItemId?: string;
  fromDayNumber?: number;
  toDayNumber?: number;
  fromPlaceLabel?: string;
  toPlaceLabel?: string;
  travelMode?: string;
  travelMinutes?: number;
  travelDistanceMeters?: number;
  departAt?: string;
  arriveAt?: string;
  activityStartAt?: string;
  fromTime?: string;
  toTime?: string;
  gapMinutes?: number;
  travelTimeMinutes?: number;
  bufferMinutes?: number;
  requiredMinutes?: number;
  shortfallMinutes?: number;
  suggestedTime?: string;
  isStartTooEarly?: boolean;
  timingSource?: 'computed' | 'missing_times' | 'user_confirmed';
}

export interface FeasibilityIssueUiHintsDto {
  primaryAction?: string;
  deepLink?: string | {
    tab?: string;
    dayIndex?: number;
    highlightItemIds?: string[];
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface FeasibilityIssueDto {
  id: string;
  priority: FeasibilityIssuePriority;
  category: FeasibilityDimensionKey | string;
  title: string;
  message: string;
  affectedDays: number[];
  tripDayId?: string;
  severity: 'high' | 'medium' | 'low';
  issueKind?: string;
  fromItemId?: string;
  toItemId?: string;
  anchors?: FeasibilityIssueAnchorsDto;
  uiHints?: FeasibilityIssueUiHintsDto;
  actionRequired?: string;
  repairOptions?: FeasibilityRepairOptionDto[];
  proofs?: FeasibilityProofDto[];
}

export interface FeasibilityAlternativeDto {
  id: string;
  name: string;
  score: number;
  executabilityRate: number;
  drivingHours?: number;
  isCurrent?: boolean;
  href?: string;
}

export interface FeasibilitySummaryDto {
  mustHandle: number;
  suggestAdjust: number;
  pendingConfirm: number;
  blockers: number;
}

/** AI-Native：POMDP + Monte Carlo 可执行性概率评估 */
export interface FeasibilityProbabilisticAssessmentDto {
  method: 'MONTE_CARLO' | 'HEURISTIC' | 'UNAVAILABLE';
  /** P(硬约束全部满足) */
  feasibilityProbability?: number;
  expectedUtility?: number;
  confidenceInterval?: {
    lower: number;
    upper: number;
    level: number;
  };
  riskMetrics?: {
    downRiskProbability: number;
    worstCase: number;
    bestCase: number;
    volatility: number;
  };
  dimensionExpectations?: Record<string, number>;
  pomdp?: {
    beliefRefinement: 'META_ALLOCATOR' | 'POMDP' | 'NONE';
    effectiveParticleCount?: number;
    observationSources?: string[];
    logNormalizationConstant?: number;
    /** 观测来源说明（如 schedule/transport → windSpeed 代理） */
    observationProvenance?: string;
    /** 观测与物理变量的独立层级 */
    independenceTier?: 'INDIRECT_PROXY' | 'DIRECT' | 'NONE';
    /** 世界模型来源 */
    worldSource?: 'world.buildContext' | 'dso_stub';
  };
  /** 审计切片（validate 写入 metadata，不覆盖 must_handle 门控） */
  audit?: {
    event: 'feasibility_mc_assess';
    feasibilityProbability: number;
    expectedUtility: number;
    sampleSize: number;
    worldSource: string;
    planSegmentCount: number;
    session_consistency_score?: number;
    dominant_cid?: string;
    drift_vector?: { delta_utility: number; delta_feasibility_proxy: number };
    /** 完整 decision_os_audit_report 契约快照 */
    decisionOsAudit?: Record<string, unknown>;
  };
  monteCarloDiagnostics?: {
    sampleSize: number;
    convergenceAchieved: boolean;
    effectiveSampleSize: number;
    durationMs: number;
  };
  keyRiskFactors?: string[];
  narrative?: string;
}

export interface TeamFitSummaryDto {
  score: number;
  memberCount: number;
  profilingCompletedCount: number;
}

export interface ItineraryCompletenessSummaryDto {
  score: number;
  signalCount: number;
}

export interface TripFeasibilityReportDto {
  tripId: string;
  tripTitle: string;
  dateRangeLabel?: string;
  verdict: FeasibilityVerdictDto;
  overallScore: number;
  verifiedAt?: string;
  verifiedForTripVersion?: string;
  currentTripVersion: string;
  isStale: boolean;
  /** 是否可进入行中执行（已验证 + 未过期 + 无 must_handle） */
  canStartExecute: boolean;
  /** 行前阶段提示（与 /score phaseHint 同源） */
  phaseHint?: string;
  /** 决策覆盖声明：基于哪些数据判断、哪些未覆盖 */
  coverageDisclosure?: CoverageDisclosure;
  dimensions: FeasibilityDimensionDto[];
  dayTimeline: FeasibilityDayTimelineDto[];
  issues: FeasibilityIssueDto[];
  alternatives: FeasibilityAlternativeDto[];
  summary: FeasibilitySummaryDto;
  /** POMDP + Monte Carlo 概率可执行性（validate 时计算，GET 读缓存） */
  probabilisticAssessment?: FeasibilityProbabilisticAssessmentDto;
  /** 团队成员适配摘要（决策画像摩擦 + 疲劳冲突） */
  teamFitSummary?: TeamFitSummaryDto;
  /** 行程结构完整摘要（餐食/重复/阻断路段） */
  itineraryCompletenessSummary?: ItineraryCompletenessSummaryDto;
}

export interface ExecutionCurrentStateDto {
  currentTime: string;
  currentLocation?: { lat: number; lng: number };
  activeItemId?: string;
  delayMinutes: number;
}

export interface ExecutionVerdictDto {
  status: ExecutionVerdictStatus;
  headline: string;
  validUntil?: string;
}

export interface ExecutionAffectedItemDto {
  itemId: string;
  title: string;
  status: ExecutionItemStatus;
  projectedArrival?: string | null;
  note?: string | null;
}

export interface ExecutionImpactsDto {
  affectedItems: ExecutionAffectedItemDto[];
  estimatedHotelArrival?: string;
  drivingAfterDarkRisk?: number;
}

export interface ExecutionDeviationDto {
  id: string;
  message: string;
  minutesImpact: number;
}

export interface ExecutionRecommendationDto {
  id: string;
  label: string;
  description: string;
  isRecommended?: boolean;
  impactSummary?: string;
  estimatedHotelArrival?: string;
  drivingAfterDarkRisk?: number;
  actionType: ExecutionActionType;
}

export interface ExecutionRealtimeRisksDto {
  road: string;
  weather: string;
  openingHours: string;
  nextCheckAt?: string;
}

export interface ExecutionEvidenceDto {
  weatherAsOf?: string;
  roadAsOf?: string;
  openingHoursAsOf?: string;
}

export interface ExecutionTechnicalFindingDto {
  id: string;
  type: string;
  message: string;
  score?: number;
}

export interface TripExecutionAdvisoryDto {
  tripId: string;
  tripDayId: string;
  dayNumber: number;
  date: string;
  routeSummary: string;
  currentState: ExecutionCurrentStateDto;
  verdict: ExecutionVerdictDto;
  impacts: ExecutionImpactsDto;
  deviations: ExecutionDeviationDto[];
  recommendations: ExecutionRecommendationDto[];
  realtimeRisks: ExecutionRealtimeRisksDto;
  evidence: ExecutionEvidenceDto;
  technicalFindings: ExecutionTechnicalFindingDto[];
}

export interface FeasibilityReportSnapshot {
  verifiedAt: string;
  verifiedForTripVersion: string;
  overallScore: number;
  verdictStatus: FeasibilityVerdictStatus;
  gateResult?: string;
}
