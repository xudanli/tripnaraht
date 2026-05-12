/**
 * P4-A++ Execution Projection View — runtime overlay on immutable TravelLeg base.
 */

import type { TravelLeg } from '../../decision/world-model';
import type { RouteExecutionAssessment } from './route-execution-assessment.types';
import type { ReliabilityAwareEta } from './route-reliability-eta.types';

export interface RouteExecutionTemporalImpact {
  /** Positive minutes vs base TravelLeg.durationMin using expected ETA. */
  expectedArrivalShiftMinutes: number;
  /** pessimistic − optimistic corridor uncertainty band. */
  uncertaintySpreadMinutes: number;
  driftSource: 'ROUTE_PHYSICS';
}

/**
 * Single runtime truth envelope for Neptune / temporal: physics + distribution + drift hints.
 * `base` should remain the planner snapshot; do not mutate it when refreshing projection.
 */
export interface ExecutionEnrichedTravelLeg {
  base: TravelLeg;
  execution: RouteExecutionAssessment;
  eta: ReliabilityAwareEta;
  temporalImpact: RouteExecutionTemporalImpact;
}
