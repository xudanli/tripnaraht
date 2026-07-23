/**
 * ONT-P2-01 — Weather Production Shadow Pilot types
 * Read-only world view; never mutates Canonical Assessment / Plan / Apply.
 */

import type { OutcomeReconciliation } from '../contracts';
import type { PredictionRecord } from '../contracts';
import type { TemporalRiskLevel } from '../contracts';

export const WEATHER_SHADOW_PILOT_SEMANTIC = 'WEATHER_DETERIORATION' as const;
export const WEATHER_SHADOW_PILOT_COUNTRY = 'IS' as const;

/** Read-only snapshot P2 may observe (no writes) */
export interface WeatherShadowWorldView {
  tripId: string;
  country: 'IS';
  /** Context revision number — observed only */
  contextRevision: number;
  regionId: string;
  subjectId: string;
  /** Route / vehicle scopes for TemporalImpact.affectedScopes */
  routeSegmentIds: string[];
  vehicleClass?: string;
  /** Current / recent weather warning facts as levels over time */
  weatherFactSeries: Array<{
    at: string;
    level: TemporalRiskLevel;
    factId?: string;
    freshness?: string;
  }>;
  /** Forecast members available at as-of (still SHADOW inputs) */
  forecastSeries: Array<{
    at: string;
    predictedLevel: TemporalRiskLevel;
    forecastIssuedAt: string;
  }>;
  asOf: string;
  horizonEndAt: string;
}

export type PredictionLifecycleStatus = 'ACTIVE' | 'SUPERSEDED' | 'RECONCILED';

export interface StoredShadowPrediction {
  record: PredictionRecord;
  status: PredictionLifecycleStatus;
  supersededByPredictionId?: string;
  storedAt: string;
}

export interface WeatherShadowPilotTickResult {
  tripId: string;
  regionId: string;
  skipped?: {
    reason:
      | 'KILL_SWITCH'
      | 'TRIP_NOT_SELECTED'
      | 'COUNTRY_NOT_IS'
      | 'NO_PREDICTION';
  };
  prediction?: StoredShadowPrediction;
  superseded?: StoredShadowPrediction;
  reconciliation?: OutcomeReconciliation;
  controlBoundary: ControlBoundarySnapshot;
}

export interface ControlBoundarySnapshot {
  authorityMode: 'SHADOW';
  canonicalApplyCalls: 0;
  constraintAssessmentMutations: 0;
  planRevisionMutations: 0;
  readyControls: 0;
  confirmControls: 0;
  executeControls: 0;
  userFacingTemporalAdviceEmitted: 0;
  fourthSemanticAdded: 0;
  /** true when any counter above would be non-zero — always false if seals hold */
  boundaryViolated: false;
}

export interface WeatherShadowPilotReport {
  schemaId: 'tripnara.ontology_p2_weather_shadow_pilot@v1';
  workItem: 'ONT-P2-01';
  generatedAt: string;
  country: 'IS';
  semanticScope: typeof WEATHER_SHADOW_PILOT_SEMANTIC;
  authorityMode: 'SHADOW';
  selectedTripIds: string[];
  ticks: WeatherShadowPilotTickResult[];
  controlBoundaryTotals: ControlBoundarySnapshot & {
    tickCount: number;
    predictionsIssued: number;
    supersessions: number;
    reconciliations: number;
  };
  replayFingerprint: string;
  killSwitchEngaged: boolean;
}

export interface WeatherShadowPilotAuthorization {
  schemaId: 'tripnara.ontology_p2_weather_shadow_pilot_authorization@v1';
  workItem: 'ONT-P2-01';
  title: 'Weather Production Shadow Pilot';
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';
  submittedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  approver?: string;
  scope: {
    country: 'IS';
    semanticScope: 'WEATHER_DETERIORATION';
    authorityMode: 'SHADOW';
    tripIds: string[];
  };
  permissions: {
    readTravelWorldFact: true;
    readContextRevision: true;
    readRouteAndVehicle: true;
    emitShadowPrediction: true;
    onlineOutcomeReconciliation: true;
    productionReplayExport: true;
  };
  prohibitions: {
    mutateConstraintAssessment: true;
    mutatePlanRevision: true;
    controlReady: true;
    controlConfirm: true;
    controlExecute: true;
    callCanonicalApply: true;
    userFacingTemporalAdvice: true;
    addFourthContinuousSemantic: true;
  };
  killSwitchEnv: 'ONTOLOGY_P2_WEATHER_SHADOW_KILL_SWITCH';
  prerequisiteGate0: 'PASS';
  notes: string[];
}
