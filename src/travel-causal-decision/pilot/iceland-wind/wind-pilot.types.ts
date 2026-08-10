/**
 * Iceland Wind Pilot — evidence record schema (full closed-loop artifact).
 */

import type { OutcomeReconciliationStatus } from '../../types/decision-outcome.types';
import type { TravelCausalDecision } from '../../types/travel-causal-decision.types';

export const ICELAND_WIND_PILOT_EVIDENCE_SCHEMA =
  'tripnara.iceland_wind_pilot_evidence@v1' as const;

export type WindPilotCaseArchetype =
  | 'WIND_NO_IMPACT'
  | 'WIND_MINOR_DELAY_STILL_OK'
  | 'FIX_BY_DEPART_EARLIER'
  | 'FIX_BY_DROP_STOP'
  | 'IRRECOVERABLE_REPLACE_OR_CANCEL'
  | 'FORECAST_CHANGE_STALE_CONTEXT'
  | 'INCOMPLETE_OBSERVATION';

export interface WindPilotFactSnapshot {
  windMps: number;
  /** Peak gust when distinct from sustained 10m wind */
  windGustMps?: number;
  windExposure?: 'low' | 'medium' | 'high';
  /** High-body campervan / motorhome */
  highRoof?: boolean;
  routeLabel: string;
  distanceKm: number;
  baseDurationMinutes: number;
  appointmentSlackMinutes: number;
  plannedDepartureAt: string;
  checkInDeadlineAt: string;
  windOnsetAt?: string;
  recoverableStopMinutes?: number;
  region?: string;
}

export interface WindPilotObservationEvidence {
  kind: 'GPS' | 'BOOKING_CHECKIN' | 'USER_ARRIVAL_CLICK' | 'NAVIGATION_EVENT' | 'NONE';
  observedAt?: string;
  arrivalTime?: string;
  completed?: boolean;
  notes?: string;
}

/**
 * Full evidence bag for one pilot case — what must be retained for replay / audit.
 */
export interface IcelandWindPilotEvidence {
  schema: typeof ICELAND_WIND_PILOT_EVIDENCE_SCHEMA;
  caseId: string;
  archetype: WindPilotCaseArchetype;
  title: string;
  titleZh: string;

  /** Input world facts */
  factSnapshot: WindPilotFactSnapshot;
  ruleVersion: string;
  contextHash: string;

  /** Product decision (may be projected live or fixture-filled) */
  decision: TravelCausalDecision;

  /** User choice */
  selectedOptionId?: string;
  /** Actual observation after execute */
  observation: WindPilotObservationEvidence;
  /** Final reconciliation */
  finalReconciliation: OutcomeReconciliationStatus;

  /** Pilot notes / expected narrative root cause (single card) */
  expectedRootCauseSummaryZh: string;
  /** Hard window that deadline must precede */
  irreparableAfterAt: string;

  meta?: {
    author?: string;
    createdAt?: string;
    notes?: string;
  };
}

export interface WindPilotPassCriteria {
  /** High-risk wind miss rate target */
  highRiskMissRateMax: number;
  /** Duplicate root-cause cards for same chain */
  duplicateRootCardMax: number;
  /** Derived effects promoted to root */
  derivedAsRootMax: number;
  /** Recommended option validation pass rate */
  recommendedValidationPassRateMin: number;
  /** New hard conflicts after apply */
  newHardConflictsAfterApplyMax: number;
}
