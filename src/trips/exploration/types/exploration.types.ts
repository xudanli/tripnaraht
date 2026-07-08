import type {
  ConsumerPrincipleId,
  ExploreEntryVariant,
  ExplorationRouteVariantStatus,
  ExplorationScenarioStatus,
} from '../constants/exploration-status.constants';

export interface ExplorationDateRange {
  startDate: string;
  endDate: string;
}

export interface ExplorationTravelerProfile {
  type: 'ADULT' | 'CHILD' | 'INFANT';
  age?: number;
}

export interface ExplorationBudgetRange {
  currency: string;
  min?: number;
  max?: number;
}

export interface ExplorationMobilityContext {
  vehicleType?: string;
  driveSide?: string;
}

export interface ExplorationInsuranceContext {
  coverageTier?: 'BASIC' | 'STANDARD' | 'FULL' | 'UNKNOWN';
}

export interface ExplorationRentalContext {
  /** 取车点（冰岛默认 KEF） */
  pickupLocation?: string;
  /** 行程首日当地取车时间 HH:mm */
  pickupTimeLocal?: string;
  /** 是否已确认非营业时间取车 */
  afterHoursPickupConfirmed?: boolean;
}

export interface ExplorationInput {
  destinationCodes: string[];
  dateRange: ExplorationDateRange;
  travelers: ExplorationTravelerProfile[];
  budget?: ExplorationBudgetRange;
  mobilityContext?: ExplorationMobilityContext;
  insuranceContext?: ExplorationInsuranceContext;
  rentalContext?: ExplorationRentalContext;
  source: 'USER_CREATED' | 'RESEARCH_PROTOCOL' | 'IMPORTED_ITINERARY';
}

export interface ExplorationScenarioView {
  scenarioId: string;
  /** RFC-003 — stable Travel Context identity (V1 equals scenarioId) */
  contextId: string;
  tripId: string | null;
  status: ExplorationScenarioStatus;
  researchProtocolId: string | null;
  participantCode: string | null;
  initialInput: ExplorationInput;
  assignedVariant: ExploreEntryVariant | null;
  materializedAt: string | null;
  createdAt: string;
}

export interface ExplorationConditionsView {
  destinationCodes: string[];
  dateRange: ExplorationDateRange;
  travelers: ExplorationTravelerProfile[];
  budget?: ExplorationBudgetRange;
  mobilityContext?: ExplorationMobilityContext;
  insuranceContext?: ExplorationInsuranceContext;
  rentalContext?: ExplorationRentalContext;
}

/** GET /scenarios/:id — 含 lockedFields 与 sessionId（前端条件页） */
export interface ExplorationScenarioDetailView extends ExplorationScenarioView {
  sessionId: string | null;
  lockedFields: string[];
  scenario: ExplorationConditionsView;
  materializationStatus: ExplorationScenarioStatus;
  candidatesStatus?: ExplorationCandidatesStatusView;
}

/** 路线候选生命周期 — 供前端判断是否需要 regenerate */
export interface ExplorationCandidatesStatusView {
  status: 'EMPTY' | 'READY' | 'STALE' | 'SELECTED';
  activeCount: number;
  generationVersion: number | null;
  generationMode?: string;
  selectedRouteId?: string | null;
}

export interface ExplorationMaterializeResult {
  scenarioId: string;
  tripId: string;
  tripVersion: number;
  decisionContractVersion: number;
  materialized: boolean;
  idempotentReplay: boolean;
}

export interface ConsumerPrincipleCardView {
  principleId: ConsumerPrincipleId;
  label: string;
  description: string;
  rank?: number;
}

export interface ExplorationIssueSourceView {
  gatewayAssessmentBatchId: string;
  canonicalIssueId: string;
  tripId: string;
  tripVersion: number;
  evidenceVersion?: string;
}

export interface ConsumerRiskViewModel {
  issueId: string;
  severity: 'BLOCK' | 'CONFLICT' | 'VERIFY' | 'OPTIMIZE';
  headline: string;
  explanation: string;
  consequence: string;
  affectedDay?: number;
  affectedSegmentLabel?: string;
  decisionRequired: boolean;
  evidence?: Array<{
    sourceLabel: string;
    verifiedAt?: string;
    confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
  }>;
  source: ExplorationIssueSourceView;
  /** CPRE 桥接 issue — 前端跳转 Compare 确认或 POST /api/poi/confirm */
  cprePoi?: {
    mention: string;
    status?: string;
    poiId?: string;
    canonicalName?: string;
    confidence?: number;
  };
}

export interface ConsumerRepairOptionViewModel {
  optionId: string;
  title: string;
  summary: string;
  preserves: string[];
  sacrifices: string[];
  impact: {
    costDelta?: number;
    drivingDeltaMinutes?: number;
    experienceDelta?: number;
    riskDelta?: number;
  };
  canApply: boolean;
}

export interface ExplorationApplyResultView {
  apply: unknown;
  revalidation?: {
    status: 'PASSED' | 'FAILED' | 'PENDING';
    message?: string;
  };
  originalProblem: {
    problemId: string;
    resolved: boolean;
    workflowStatus?: string;
    executionStatus?: string;
  };
  issues: ExplorationIssuesResponse;
}

export interface ExplorationIssuesResponse {
  displayedIssues: ConsumerRiskViewModel[];
  totalIssueCount: number;
  /** Gateway Decision Queue 问题数（不含 CPRE POI 桥接） */
  gatewayIssueCount?: number;
  /** CPRE 未确认 POI 桥接 issue 数 */
  unresolvedPoiIssueCount?: number;
  /** Travel Ontology 约束投影 issue 数（Snapshot SSOT） */
  ontologyIssueCount?: number;
  /** 全量 BLOCK 级 issue 数（含 Gateway / Ontology / POI，不受 displayPolicy 截断） */
  blockerIssueCount?: number;
  displayPolicy: {
    maxIssues: number;
    preferredSeverity: string;
  };
}

export interface RouteSelectionResearchData {
  selectedRouteId: string;
  selectionReason?: string;
  prioritizedGainIds: string[];
  acceptedSacrificeIds: string[];
  concernText?: string;
}

export interface ExplorationRouteVariantView {
  routeId: string;
  strategyId: string;
  variantId: string;
  itineraryVersion: number;
  status: ExplorationRouteVariantStatus;
  title: string;
  narrative: string;
  metrics: Record<string, number>;
  gains: Array<{ id: string; label: string }>;
  sacrifices: Array<{ id: string; label: string }>;
  generationVersion: number;
  /** STATIC_CATALOG | PERSONALIZED | ENGINE_MAPBOX | LLM */
  generationSource?: string;
  /** 候选列表轻量预览（含 map 折线） */
  preview?: ExplorationRoutePreviewPayload;
  /** CPRE — 路线内 POI 解析结果（Compare 卡片展示 ✓已验证 / ⚠待确认）；compare 响应始终包含 */
  resolvedPois: import('../config/iceland-route-detail.catalog').ExplorationResolvedPoiRef[];
}

export interface RouteMapPoint {
  lng: number;
  lat: number;
}

export type RouteLineCoordinates = Array<[number, number]>;

export interface RouteMapLayerView {
  id: 'main' | 'fRoad';
  label: string;
  coordinates: RouteLineCoordinates;
  lineStyle: 'solid' | 'dashed';
  requires4wd?: boolean;
}

export interface RouteMapGeometry {
  mainLine: RouteLineCoordinates;
  fRoadLine?: RouteLineCoordinates;
  layers?: RouteMapLayerView[];
}

export interface RouteDayDetail {
  day: number;
  theme: string;
  route: string;
  driving: string;
  experience: string;
  stay: string;
  mapPoint: RouteMapPoint;
  tip?: string;
  highlight?: boolean;
}

import type { ExplorationRouteDetailPayload } from '../config/iceland-route-detail.catalog';

export type {
  ExplorationResolvedPoiRef,
  ExplorationRouteDetailPayload,
} from '../config/iceland-route-detail.catalog';

export interface ExplorationRouteDetailView {
  routeId: string;
  strategyId: string;
  title: string;
  tagline: string;
  badge: { label: string; tone: string };
  detail: ExplorationRouteDetailPayload;
}

export interface ExplorationRoutePreviewPayload {
  summary: string;
  totalKm: number;
  avgDrivingHours: number;
  regions: string[];
  map: RouteMapGeometry;
}

export interface ExplorationRoutePreviewView {
  routeId: string;
  tagline: string;
  badge: { label: string; tone: string };
  preview: ExplorationRoutePreviewPayload;
}

export interface RouteStrategyProfile {
  strategyId: string;
  archetype: string;
  weights: {
    coverage: number;
    depth: number;
    drivingPenalty: number;
    remoteExploration: number;
    stayStability: number;
    uncertaintyPenalty: number;
  };
  explanationKey: string;
}

export interface RegionTemplate {
  templateId: string;
  destinationCode: string;
  regions: string[];
  routeSegments: string[];
  stayAnchors: string[];
}
