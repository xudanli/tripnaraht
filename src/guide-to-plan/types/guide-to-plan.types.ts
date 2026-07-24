import type {
  GuideCredibilityLevel,
  GuideParseStatus,
  GuidePlanCandidateStatus,
  GuidePlanVariant,
  GuideSourceType,
  GuideToPlanSessionStatus,
  InspirationCandidateType,
  PoiMatchStatus,
} from '../constants/guide-to-plan-status.constants';
import type { ResolvedGuidePoi } from './guide-spatial.types';

export interface ExtractedPlace {
  name: string;
  nameEn?: string;
  type?: InspirationCandidateType;
  suggestedDay?: number;
  routeOrder?: number;
  stayDurationMinutes?: number;
}

export interface ExtractedRoute {
  day?: number;
  description: string;
  placeNames: string[];
  transportMode?: string;
}

export interface ExtractedTip {
  text: string;
  category?: string;
  relatedPlaceName?: string;
}

export interface ImplicitAssumption {
  assumption: string;
  category?: 'transport' | 'fitness' | 'season' | 'group' | 'other';
}

export interface GuideTravelContext {
  startDate?: string;
  endDate?: string;
  travelers?: {
    adults?: number;
    children?: number;
    seniors?: number;
  };
  transportMode?: 'self_drive' | 'bus' | 'tour' | 'mixed' | 'unknown';
  /** 冰岛自驾车型（影响 F-road 可达性裁决） */
  vehicleType?: '2wd' | '4x4' | 'suv' | 'campervan';
  preserveExperiences?: string[];
  countryCode?: string;
  destination?: string;
}

export interface GuideCanonicalDecisionSummary {
  decisionId: string;
  problemId: string;
  recommendedVariant: GuidePlanVariant;
  humanDecisionRequired: boolean;
  finalizedAt: string;
  /** Set after canonical L2 accept + execute */
  acceptedTripId?: string;
  effectivePlanVersionId?: string;
  itemCount?: number;
}

export interface GuideUnderstandingSummary {
  guideCount: number;
  placeCount: number;
  restaurantCount: number;
  hotelAreaCount: number;
  tipCount: number;
  riskCount: number;
  unmatchedPlaceCount: number;
  suggestedTripDays?: number;
  themeNarrative?: string;
  potentialIssues: string[];
  /** Session-level DecisionCore.finalize summary (Guide canonical path) */
  canonicalDecision?: GuideCanonicalDecisionSummary;
}

export interface GuidePendingConfirmation {
  field: string;
  label: string;
  reason: string;
  required: boolean;
}

export interface GuideComparisonDiffRow {
  aspect: string;
  originalGuide: string;
  adjustedPlan: string;
  reason?: string;
}

export interface ImportedGuideView {
  id: string;
  title?: string | null;
  sourceType: GuideSourceType;
  sourceUrl?: string | null;
  sourcePlatform?: string | null;
  sourceMetadata?: GuideSourceMetadata | null;
  parseStatus: GuideParseStatus;
  sourceConfidence: number;
  credibilityLevel: GuideCredibilityLevel;
  importedAt: string;
  parsedAt?: string | null;
  parseError?: string | null;
}

export interface GuideInspirationCandidateView {
  id: string;
  candidateType: InspirationCandidateType;
  rawName: string;
  rawNameEn?: string | null;
  placeId?: number | null;
  matchStatus: PoiMatchStatus;
  credibilityLevel: GuideCredibilityLevel;
  suggestedDay?: number | null;
  routeOrder?: number | null;
  sourceGuideIds: string[];
  /** POI 实体解析结果（placeId + 经纬度 + 匹配置信度） */
  geo?: ResolvedGuidePoi | null;
  geoResolutionStatus?: string;
}

export interface GuideClaimView {
  id: string;
  claimType: string;
  subjectName?: string | null;
  statement: string;
  confidenceLevel: GuideCredibilityLevel;
  verificationStatus: string;
}

export interface GuidePlanCandidateView {
  id: string;
  variant: GuidePlanVariant;
  status: GuidePlanCandidateStatus;
  comparisonDiff?: GuideComparisonDiffRow[] | null;
  retainedCount: number;
  modifiedCount: number;
  rejectedCount: number;
  createdAt: string;
}

export interface GuideToPlanSessionView {
  id: string;
  status: GuideToPlanSessionStatus;
  countryCode?: string | null;
  destination?: string | null;
  travelContext?: GuideTravelContext | null;
  understandingSummary?: GuideUnderstandingSummary | null;
  themeNarrative?: string | null;
  tripId?: string | null;
  importedGuides: ImportedGuideView[];
  createdAt: string;
  updatedAt: string;
  /** 恢复会话用：解析任务快照（避免额外请求 parse/status） */
  parseProgress?: Pick<GuideParseProgressView, 'status' | 'progress' | 'error' | 'currentStepLabel'> | null;
  requiresTravelContext?: boolean;
  draftCandidateCount?: number;
  /** 建议前端跳转路由 */
  resumeRoute?:
    | 'import'
    | 'parse_progress'
    | 'understanding'
    | 'travel_context'
    | 'draft'
    | 'trip';
}

export interface GuideUnderstandingView {
  sessionId: string;
  status: GuideToPlanSessionStatus;
  summary: GuideUnderstandingSummary;
  themeNarrative?: string | null;
  places: GuideInspirationCandidateView[];
  claims: GuideClaimView[];
  importedGuides: ImportedGuideView[];
  requiresTravelContext: boolean;
  pendingConfirmations: GuidePendingConfirmation[];
  /** 是否尚未解析（前端可提示「开始解析」） */
  parseRequired?: boolean;
  /** 已成功解析的攻略篇数 */
  parsedGuideCount?: number;
}

export interface GuideParseResult {
  places: ExtractedPlace[];
  routes: ExtractedRoute[];
  tips: ExtractedTip[];
  implicitAssumptions: ImplicitAssumption[];
  claims: Array<{
    claimType: string;
    subjectName?: string;
    statement: string;
  }>;
  themeNarrative?: string;
  suggestedTripDays?: number;
}

export interface GuideSourceMetadata {
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  pageCount?: number;
  wordCount?: number;
  author?: string;
  format?: string;
}

export interface GuideParseProgressCounts {
  places: number;
  restaurants: number;
  hotels: number;
  tips: number;
  risks: number;
}

export interface GuideParseProgressView {
  jobId: string;
  status: 'idle' | 'queued' | 'running' | 'completed' | 'failed';
  currentStep?: string;
  currentStepLabel?: string;
  progress: number;
  estimatedSecondsRemaining?: number;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  counts: GuideParseProgressCounts;
  recognizedTags: string[];
}

export interface GuideImportPreviewView {
  guideCount: number;
  estimatedPlaces: number;
  estimatedRestaurants: number;
  estimatedHotels: number;
  estimatedRisks: number;
}

/** Persisted on GuidePlanCandidate.personaOpinions */
export interface GuidePlanCandidatePersonaOpinions {
  decisionEngineStatus?: 'unavailable' | 'applied' | 'skipped' | 'finalized';
  canonical?: {
    finalized: boolean;
    recommended: boolean;
    decisionId: string;
    overallStatus?: string;
  };
}

export interface GuidePlanCandidateDetailView {
  id: string;
  variant: GuidePlanVariant;
  status: GuidePlanCandidateStatus;
  comparisonDiff?: GuideComparisonDiffRow[] | null;
  itineraryDraft?: unknown;
  decisionReasons?: unknown;
  retainedItems?: unknown;
  modifiedItems?: unknown;
  rejectedItems?: unknown;
  warnings?: string[];
  feasibilityScore: number;
  pendingConfirmations: GuidePendingConfirmation[];
  decisionEngineStatus?: 'unavailable' | 'applied' | 'skipped' | 'finalized';
  finalized?: boolean;
  canonicalRecommended?: boolean;
  canonicalDecisionId?: string;
  canonicalOverallStatus?: string;
  createdAt: string;
}

export interface GuidePlanReviewItem {
  reviewKey: string;
  day: number;
  date?: string;
  name: string;
  type: string;
  placeId?: number | null;
  candidateId?: string;
  source: 'guide' | 'adjusted';
  startTime: string;
  endTime: string;
  defaultSelected: boolean;
}
