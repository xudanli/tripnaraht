/** Exploration Consumer API — 前端类型（Hub ① + 完整闭环） */

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { message?: string; code?: string };
}

export interface ExplorationScenarioCreated {
  scenarioId: string;
  sessionId: string;
  tripId: string | null;
  materializationStatus: string;
  assignedVariant: 'SINGLE_RECOMMENDATION' | 'THREE_ROUTE_COMPARISON' | 'THEME_FIRST' | null;
  researchProtocolId?: string | null;
  lockedFields?: string[];
  scenario?: ExplorationConditionsView;
}

export interface ExplorationConditionsView {
  destinationCodes: string[];
  dateRange: { startDate: string; endDate: string };
  travelers: Array<{ type: string; age?: number }>;
  budget?: { currency: string; min?: number; max?: number };
  mobilityContext?: { vehicleType?: string };
  insuranceContext?: { coverageTier?: 'BASIC' | 'STANDARD' | 'FULL' | 'UNKNOWN' };
  rentalContext?: {
    pickupLocation?: string;
    pickupTimeLocal?: string;
    afterHoursPickupConfirmed?: boolean;
  };
}

export interface ExplorationScenarioDetail extends ExplorationScenarioCreated {
  lockedFields: string[];
  scenario: ExplorationConditionsView;
  initialInput?: ExplorationConditionsView;
  candidatesStatus?: ExplorationCandidatesStatus;
}

export interface ExplorationCandidatesStatus {
  status: 'EMPTY' | 'READY' | 'STALE' | 'SELECTED';
  activeCount: number;
  generationVersion: number | null;
  generationMode?: 'STATIC' | 'PERSONALIZED' | 'ENGINE';
  selectedRouteId?: string | null;
}

export interface ConditionsCatalogView {
  destinationCode: string;
  destinationLabel: string;
  vehicleTypes: Array<{ code: string; label: string }>;
  insuranceTiers?: Array<{ code: string; label: string; description: string }>;
  budgetPresets: Array<{ currency: string; min: number; max: number }>;
  supportedDestinationCodes: string[];
}

export interface ConsumerPrincipleCard {
  principleId: string;
  label: string;
  description: string;
  rank?: number;
}

export interface PrinciplesSummaryView {
  summary: string | null;
  placeholder?: string | null;
  highlights?: string[];
  source?: 'LLM' | 'RULES';
  generatedAt?: string;
}

export interface ResolvedPoiRef {
  name: string;
  resolved: boolean;
  poiId?: string;
  confidence?: number;
  method?: string;
  status?: 'MATCHED' | 'AMBIGUOUS' | 'NOT_FOUND' | 'NEEDS_CONFIRMATION';
  canonicalName?: string;
}

export interface RouteCandidate {
  routeId: string;
  strategyId: string;
  title: string;
  narrative: string;
  metrics: Record<string, number>;
  gains: Array<{ id: string; label: string }>;
  sacrifices: Array<{ id: string; label: string }>;
  generationSource?: 'STATIC_CATALOG' | 'PERSONALIZED' | 'ENGINE_MAPBOX' | 'LLM';
  preview?: RouteMapPreview;
  /** CPRE — 路线 POI 解析（Compare 卡片 ✓已验证 / ⚠待确认）；compare 响应始终包含 */
  resolvedPois: ResolvedPoiRef[];
}

export interface CompareDimensionDef {
  key: string;
  label: string;
  higherIsBetter: boolean;
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
  /** Compare / 候选地图 — 前端按 layer 绘制（main 实线、fRoad 虚线橙色） */
  layers?: RouteMapLayerView[];
}

export interface RouteMapPreview {
  summary: string;
  totalKm: number;
  avgDrivingHours: number;
  regions: string[];
  map: RouteMapGeometry;
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

export interface ExplorationRouteDetailView {
  routeId: string;
  strategyId: string;
  title: string;
  tagline: string;
  badge: { label: string; tone: string };
  detail: {
    summary: string;
    totalKm: number;
    avgDrivingHours: number;
    stayChanges: number;
    regions: string[];
    highlights: string[];
    preparations: string[];
    days: RouteDayDetail[];
    map: RouteMapGeometry;
  };
}

export interface ConsumerIssue {
  issueId: string;
  severity: string;
  headline: string;
  explanation: string;
  consequence: string;
  affectedDay?: number;
  affectedSegmentLabel?: string;
  decisionRequired: boolean;
  evidence?: Array<{ sourceLabel: string; verifiedAt?: string; confidence?: string }>;
  source: {
    gatewayAssessmentBatchId: string;
    canonicalIssueId: string;
    tripId: string;
    tripVersion: number;
  };
  /** CPRE 桥接 — issueId 前缀 `cpre-poi-` */
  cprePoi?: {
    mention: string;
    status?: string;
    poiId?: string;
    canonicalName?: string;
    confidence?: number;
  };
}

export interface CheckJobRecord {
  jobId: string;
  scenarioId: string;
  tripId: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED';
  createdAt: string;
  completedAt?: string;
  error?: string;
  result?: {
    verdictStatus?: string;
    totalIssueCount: number;
    checkDurationMs: number;
    feasibilitySummary?: {
      mustHandle: number;
      suggestAdjust: number;
      pendingConfirm: number;
    };
    gatewayOpenCount?: number;
    unresolvedPoiCount?: number;
    ontologyIssueCount?: number;
    blockerIssueCount?: number;
    diagnosis?: string;
  };
}

export interface CheckJobPollView {
  job: CheckJobRecord;
  issues?: IssuesView;
}

export interface IssuesView {
  displayedIssues: ConsumerIssue[];
  totalIssueCount: number;
  gatewayIssueCount?: number;
  unresolvedPoiIssueCount?: number;
  /** Travel Ontology Snapshot 投影 — issueId 前缀 `ontology:` */
  ontologyIssueCount?: number;
  /** 全量 BLOCK 计数（不受 displayPolicy 截断） */
  blockerIssueCount?: number;
  displayPolicy: { maxIssues: number; preferredSeverity: string };
}

export interface RepairOption {
  optionId: string;
  title: string;
  summary: string;
  preserves: string[];
  sacrifices: string[];
  impact: {
    costDelta?: number;
    drivingDeltaMinutes?: number;
    experienceDelta?: number;
  };
  canApply: boolean;
}

export interface ApplyDecisionView {
  revalidation?: { status: string; message?: string };
  originalProblem: {
    problemId: string;
    resolved: boolean;
    workflowStatus?: string;
  };
  issues: IssuesView;
}

export interface PackageCard {
  packageId: string;
  displayOrder: number;
  title: string;
  subtitle: string;
  description: string;
  valueProps: string[];
}

export interface ContinuePackagesView {
  sessionId: string;
  presentationOrder: string[];
  packages: PackageCard[];
  presentationMode: string;
}

export interface CommitmentResult {
  commitmentId: string;
  commitmentType: 'NOTIFY_ME' | 'SELF_CHECK' | 'DEPOSIT' | 'PRICE_LOCK';
  sessionId: string;
  message: string;
}

export interface ResearchPaymentLegal {
  productStatus: string;
  depositTitle: string;
  depositBody: string;
  priceLockBody: string;
  noScarcity: boolean;
  refundPolicy: string;
}

export interface DepositPaymentView {
  paymentRecordId: string;
  status: string;
  stripePaymentIntentId: string | null;
  clientSecret: string | null;
  amountCents: number;
  currency: string;
  displayAmount: string;
  legal: ResearchPaymentLegal;
  skuId: string;
  commitment?: CommitmentResult;
}

export interface PaymentCatalogView {
  legal: ResearchPaymentLegal;
  depositSku: {
    skuId: string;
    amountCents: number;
    currency: string;
    displayAmount: string;
    refundable: boolean;
  };
  sandboxMode: boolean;
}

export interface PriceLockResult {
  paymentRecordId: string;
  lockedPriceUsd: number;
  commitment: CommitmentResult;
  legal: string;
}

/** React Router 页面上下文（建议存 sessionStorage） */
export interface ExplorationFlowState {
  scenarioId: string;
  sessionId: string;
  tripId?: string;
  assignedVariant?: string;
  selectedRouteId?: string;
  activeProblemId?: string;
}
