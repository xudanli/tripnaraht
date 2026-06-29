import type { CoverageMapData } from '../readiness/types/coverage-map.types';
import type { JourneyMapDecisionItemDto } from './journey-map-decision-item.dto';
import type {
  DecisionCheckerEvidenceDto,
  DecisionCheckerImpactDto,
} from '../trip-constraint-solver/types/decision-checker.types';
import type { ReadinessScoreFinding, ReadinessScoreRisk } from '../readiness/types/coverage-map.types';

export type JourneyMapInclude = 'shell' | 'inspector';
export type JourneyMapCoverageFields = 'full' | 'minimal';

export type JourneyMapMemberGroupId = 'young' | 'elderly' | 'children';

export interface JourneyMapMemberDto {
  id: string;
  name: string;
  initials: string;
  groupId: JourneyMapMemberGroupId;
  avatarColor?: string;
}

export interface JourneyMapMemberGroupDto {
  id: JourneyMapMemberGroupId;
  label: string;
  count: number;
}

export interface JourneyMapDaySummaryDto {
  day: number;
  routeLabel: string;
}

export type JourneyMapGeometrySource = 'route_api' | 'straight_line' | 'cached_metadata';

export interface JourneyMapDiversionGroupDto {
  label: string;
  activityId: string;
  color: string;
  participantIds?: string[];
  polyline?: string;
  geometrySource?: JourneyMapGeometrySource;
}

export interface JourneyMapDiversionMergeDto {
  coordinates: [number, number];
  label: string;
  activityId?: string;
  time?: string;
  /** A 组活动 → 汇合点 */
  polylineA?: string;
  /** B 组活动 → 汇合点 */
  polylineB?: string;
  geometrySource?: JourneyMapGeometrySource;
}

export interface JourneyMapDiversionDto {
  id: string;
  dayIndex: number;
  title: string;
  groupA: JourneyMapDiversionGroupDto;
  groupB: JourneyMapDiversionGroupDto;
  splitCoordinates?: [number, number];
  trunkSegmentIds?: string[];
  forkAfterSegmentId?: string;
  merge?: JourneyMapDiversionMergeDto;
}

export interface JourneyMapStatsDto {
  totalDays: number;
  totalDistanceKm: number;
  activityCount: number;
  diversionCount: number;
}

export interface JourneyMapDataFeedDto {
  id: 'weather' | 'road' | 'hours' | 'inventory';
  label: string;
  updatedAt: string;
  status: 'fresh' | 'stale';
}

export interface JourneyMapTripDaySummary {
  id: string;
  date: string;
  theme: string | null;
}

export interface JourneyMapTripSummary {
  id: string;
  name: string | null;
  destination: string;
  updatedAt: string;
  TripDay: JourneyMapTripDaySummary[];
}

export interface JourneyMapInspectorPayload {
  evidence: DecisionCheckerEvidenceDto | null;
  impact: DecisionCheckerImpactDto | null;
  scoreRisks: ReadinessScoreRisk[];
  scoreFindings: ReadinessScoreFinding[];
  /** 按 activityId 索引的检查器富化（仅 include=inspector） */
  activityContexts?: JourneyMapInspectorActivityContext[];
  /** 用户从 Inspector 创建的决策事项（P2 写操作） */
  decisionItems?: JourneyMapDecisionItemDto[];
}

export type JourneyMapEvidenceVerdict = 'executable' | 'caution' | 'blocked' | 'unknown';

export interface JourneyMapInspectorActivityDetailDto {
  activityId: string;
  activityTypeLabel?: string;
  durationHours?: number;
  transportMinutes?: number;
  equipment?: string[];
  weatherWindow?: string;
  guideInfo?: string;
  intensityScore?: number;
  summary?: string;
}

export interface JourneyMapInspectorMemberRowDto {
  memberId: string;
  participating: boolean;
  roleLabel?: string;
  tags?: string[];
  alternativePlan?: string | null;
}

export interface JourneyMapInspectorFitAssessmentDto {
  suitabilityPercent?: number;
  suitabilityLabel?: string;
  physicalRequirement?: string;
  riskLevel?: string;
  weatherImpact?: string;
  suggestion?: string;
}

export interface JourneyMapInspectorDiversionGroupDetailDto {
  label: string;
  badge?: string;
  activityType?: string;
  timeRange?: string;
  transport?: string;
  route?: string;
  estimatedCost?: string;
  riskLevel?: string;
  participantCount?: number;
}

export interface JourneyMapInspectorDiversionDetailDto {
  activityId: string;
  overview?: string;
  splitTime?: string;
  meetingPoint?: string;
  meetingTime?: string;
  emergencyContact?: string;
  emergencyNote?: string;
  groupA?: JourneyMapInspectorDiversionGroupDetailDto;
  groupB?: JourneyMapInspectorDiversionGroupDetailDto;
}

export interface JourneyMapInspectorEvidenceSourceDto {
  id: string;
  label: string;
  updatedAt?: string;
  status: 'fresh' | 'stale';
}

export interface JourneyMapInspectorWeatherSnapshotDto {
  summary?: string;
  hourly?: Array<{ time: string; tempC?: number; windKmh?: number; condition?: string }>;
}

export interface JourneyMapInspectorRouteEvidenceDto {
  distanceKm?: number;
  durationMinutes?: number;
  passability?: string;
  geometrySource?: JourneyMapGeometrySource;
}

export interface JourneyMapInspectorActivitySourceDto {
  operator?: string;
  status?: string;
  hoursLabel?: string;
}

export interface JourneyMapInspectorEvidenceConclusionDto {
  verdict: JourneyMapEvidenceVerdict;
  text: string;
}

export interface JourneyMapInspectorRiskMajorDto {
  description: string;
  severity: string;
}

export interface JourneyMapInspectorRiskViewDto {
  level: 'high' | 'medium' | 'low';
  levelLabel: string;
  score?: number;
  updatedAt?: string;
  affectedCount?: number;
  totalCount?: number;
  keyRisks?: string[];
  majorRisks?: JourneyMapInspectorRiskMajorDto[];
  impactScope?: {
    hubs?: string;
    members?: string;
    time?: string;
    budget?: string;
  };
  mitigations?: string[];
}

export interface JourneyMapInspectorActivityContext {
  activityId: string;
  activityDetail?: JourneyMapInspectorActivityDetailDto;
  memberRows?: JourneyMapInspectorMemberRowDto[];
  fitAssessment?: JourneyMapInspectorFitAssessmentDto;
  diversionDetail?: JourneyMapInspectorDiversionDetailDto;
  evidenceSources?: JourneyMapInspectorEvidenceSourceDto[];
  weatherSnapshot?: JourneyMapInspectorWeatherSnapshotDto;
  routeEvidence?: JourneyMapInspectorRouteEvidenceDto;
  activitySource?: JourneyMapInspectorActivitySourceDto;
  evidenceConclusion?: JourneyMapInspectorEvidenceConclusionDto;
  riskView?: JourneyMapInspectorRiskViewDto;
}

export interface JourneyMapResponseDto {
  tripId: string;
  trip: JourneyMapTripSummary;
  coverage: CoverageMapData;
  itineraryItems: Record<string, unknown>[];
  feasibilityScore?: number;
  travelerCount?: number;
  members?: JourneyMapMemberDto[];
  memberGroups?: JourneyMapMemberGroupDto[];
  daySummaries?: JourneyMapDaySummaryDto[];
  diversions?: JourneyMapDiversionDto[];
  stats?: JourneyMapStatsDto;
  dataFeeds?: JourneyMapDataFeedDto[];
  inspector?: JourneyMapInspectorPayload;
  etag?: string;
}

export interface JourneyMapInspectorActivityResponseDto {
  tripId: string;
  activityId: string;
  context: JourneyMapInspectorActivityContext;
  evidence: DecisionCheckerEvidenceDto | null;
  impact: DecisionCheckerImpactDto | null;
  etag?: string;
}

