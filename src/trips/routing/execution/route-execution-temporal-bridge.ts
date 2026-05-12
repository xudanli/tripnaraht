/**
 * Maps corridor physics overlay → TimeDrift[] for the single temporal pipeline.
 * Neptune / repair consume normalized drifts + slot overlays, not raw RouteExecutionAssessment alone.
 */

import type { TimeDrift } from '../../decision/temporal/time-drift.types';
import type { ExecutionEnrichedTravelLeg } from './execution-enriched-travel-leg.types';

export interface RouteExecutionTemporalBridgeInput {
  date: string;
  sourceSlotId: string;
  enriched: ExecutionEnrichedTravelLeg;
}

const EPSILON_MIN = 0.75;

/**
 * Emits SEQUENCE drift for corridor delay vs base leg ETA; BLOCKED → NO_PROPAGATION advisory.
 * Cross-day spill is handled downstream by {@link emitCrossDayHandoffDrifts} on accumulated SEQUENCE.
 */
export function routeExecutionToTemporalDrifts(
  input: RouteExecutionTemporalBridgeInput,
): TimeDrift[] {
  const { enriched, date, sourceSlotId } = input;
  const { execution, eta, temporalImpact, base } = enriched;
  const tag = 'route_execution_physics_v1';

  if (execution.executionState === 'BLOCKED') {
    return [
      {
        id: `drift_route_blocked_${date}_${sourceSlotId}`,
        date,
        sourceSlotId,
        deltaMinutes: 0,
        confidence: Math.max(0.35, eta.reliabilityScore),
        propagationPolicy: 'NO_PROPAGATION',
        cause: {
          kind: 'ROUTE_EXECUTION_PHYSICS',
          executionState: execution.executionState,
          reliabilityScore: eta.reliabilityScore,
          uncertaintySpreadMinutes: temporalImpact.uncertaintySpreadMinutes,
        },
        narrative: `[${tag}] Corridor physics BLOCKED — do not rely on baseline drive ETA (${base.durationMin}min).`,
      },
    ];
  }

  const shift = temporalImpact.expectedArrivalShiftMinutes;
  if (shift < EPSILON_MIN) {
    return [];
  }

  const rounded = Math.max(1, Math.round(shift));
  return [
    {
      id: `drift_route_seq_${date}_${sourceSlotId}`,
      date,
      sourceSlotId,
      deltaMinutes: rounded,
      confidence: Math.max(0.4, Math.min(0.95, eta.reliabilityScore)),
      propagationPolicy: 'PROPAGATE_SEQUENCE',
      cause: {
        kind: 'ROUTE_EXECUTION_PHYSICS',
        executionState: execution.executionState,
        delayFactor: execution.estimatedDelayFactor,
        reliabilityScore: eta.reliabilityScore,
        uncertaintySpreadMinutes: temporalImpact.uncertaintySpreadMinutes,
      },
      narrative: `[${tag}] Corridor delay +${rounded}min vs baseline (${base.durationMin}min); spread≈${temporalImpact.uncertaintySpreadMinutes}min`,
    },
  ];
}
