import type { ConstraintAssessment } from '../contracts/constraint-assessment.types';
import type { ActionProposal } from '../contracts/action-proposal.types';
import type { TravelWorldFact } from '../contracts/travel-world-fact.types';

export const WEATHER_DETERIORATION_SEMANTIC = 'WEATHER_DETERIORATION' as const;

export type WeatherWarningLevel = 'NONE' | 'YELLOW' | 'ORANGE' | 'RED';
export type WeatherProductBehavior =
  | 'WORLD_STATE_ONLY'
  | 'MONITORING'
  | 'ACTIVE_ADJUSTMENT'
  | 'ACTIVE_RISK_BLOCK'
  | 'EXECUTION_BLOCK_URGENT';
export type WeatherImpactKind =
  | 'HIGH_ROOF_VEHICLE'
  | 'EXPOSED_SEGMENT'
  | 'ACTIVITY_OUTDOOR'
  | 'DRIVE_WINDOW'
  | 'LAST_ACTION_DEADLINE';

export interface WeatherWarningObservation {
  regionId: string;
  subjectId: string;
  warningLevel: WeatherWarningLevel;
  observedAt: string;
  validFrom?: string;
  validTo?: string;
  expiresAt?: string;
  authorityLevel?: TravelWorldFact['authorityLevel'];
  provider?: string;
  evidenceId?: string;
  tripId?: string;
  country?: string;
  region?: string;
  confidence?: number;
}

export interface WeatherPlanSegmentRef {
  segmentId: string;
  dayIndex?: number;
  itineraryItemId?: string;
  regionIds?: string[];
  windExposed?: boolean;
  outdoorActivity?: boolean;
  label?: string;
}

export interface WeatherPlanView {
  tripId: string;
  revision: number;
  segments: WeatherPlanSegmentRef[];
  vehicleClass?: string;
  activityItemIds?: string[];
  enRouteOnExposedSegment?: boolean;
  affectsFutureDaysOnly?: boolean;
}

export interface WeatherTimeline {
  onsetAt?: string;
  deterioratedAt?: string;
  peakLevel?: WeatherWarningLevel;
  lastActionBy?: string;
}

export interface WeatherPlanImpact {
  regionId: string;
  warningLevel: WeatherWarningLevel;
  matchedSegmentIds: string[];
  affectedPlanItemIds: string[];
  impacts: Array<{
    kind: WeatherImpactKind;
    planItemId?: string;
    segmentId?: string;
    note: string;
  }>;
  productBehavior: WeatherProductBehavior;
  affectsActivePlan: boolean;
  timeline: WeatherTimeline;
}

export interface WeatherDecisionProblem {
  problemId: string;
  tripId: string;
  rootAssessmentId: string;
  problemType: 'WIND_HIGH_ROOF_RISK' | 'WEATHER_ROUTE_EXPOSURE';
  semanticScope: typeof WEATHER_DETERIORATION_SEMANTIC;
  title: string;
  status: 'OPEN' | 'AWAITING_USER';
  impactList: WeatherPlanImpact['impacts'];
  productBehavior: WeatherProductBehavior;
  timeline: WeatherTimeline;
}

export interface WeatherRepairCandidate {
  proposalId: string;
  label: string;
  kind: 'DOWNGRADE_VEHICLE' | 'AVOID_EXPOSED_SEGMENT' | 'SHIFT_DEPARTURE';
  factsAfter: TravelWorldFact[];
  secondaryValidation: {
    outcome: ConstraintAssessment['outcome'];
    reasonCodes: string[];
    safeToOffer: boolean;
    verified: false;
  };
  actionProposal: ActionProposal;
}

export interface WeatherLoopResult {
  facts: TravelWorldFact[];
  assessment: ConstraintAssessment | null;
  decisionProblem: WeatherDecisionProblem | null;
  impact: WeatherPlanImpact | null;
  repairCandidates: WeatherRepairCandidate[];
  /** Authority Consistency — bind Gateway / Apply to one DecisionScope. */
  decisionScope?: import('../../decision-runtime/contracts/decision-scope.types').DecisionScope;
  worldStateSnapshotId?: string;
  applied?: {
    outcomeEventId: string;
    revisionBefore: number;
    revisionAfter: number;
    assessmentIdBefore: string;
    assessmentIdAfter: string;
    outcomeAfter: ConstraintAssessment['outcome'];
  };
}
