import type { TravelLeg } from '../../decision/world-model';
import type { ExecutionEnrichedTravelLeg } from './execution-enriched-travel-leg.types';
import type { RouteExecutionProjection } from './project-route-execution-hazards';

export function buildExecutionEnrichedTravelLeg(
  base: TravelLeg,
  projection: RouteExecutionProjection,
): ExecutionEnrichedTravelLeg {
  const shift = Math.max(0, projection.eta.expectedMinutes - base.durationMin);
  const spread = Math.max(
    0,
    projection.eta.pessimisticMinutes - projection.eta.optimisticMinutes,
  );
  return {
    base,
    execution: projection.assessment,
    eta: projection.eta,
    temporalImpact: {
      expectedArrivalShiftMinutes: Math.round(shift),
      uncertaintySpreadMinutes: Math.round(spread),
      driftSource: 'ROUTE_PHYSICS',
    },
  };
}
