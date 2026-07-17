/**
 * Push ActualOutcomeSnapshot onto Canonical Causal Trace TravelCausalDecision.
 */

import type { CanonicalCausalTraceService } from '../../causal-protocol/services/canonical-causal-trace.service';
import type { ActualOutcomeSnapshot } from '../types/decision-outcome.types';
import type { TravelCausalDecision } from '../types/travel-causal-decision.types';

export interface ApplyObservationToCausalTraceInput {
  tripId: string;
  problemId: string;
  actual: ActualOutcomeSnapshot;
  /** When true, also mark trace CALIBRATED. */
  calibrate?: boolean;
  outcomeRef?: string;
  predictedMinutes?: number;
  actualMinutes?: number;
}

/**
 * Reconcile TravelCausalDecision on the active problem trace with a live observation.
 * Returns updated decision when a trace+decision exists.
 */
export function applyObservationToCausalTrace(
  causalTrace: CanonicalCausalTraceService,
  input: ApplyObservationToCausalTraceInput,
): TravelCausalDecision | undefined {
  const ref = causalTrace.getActiveRef(input.tripId, input.problemId);
  if (!ref) return undefined;
  const trace = causalTrace.getTrace(ref.traceId);
  if (!trace?.travelCausalDecision) return undefined;

  if (input.calibrate) {
    causalTrace.bindCalibrated({
      traceId: ref.traceId,
      outcomeRef: input.outcomeRef ?? `obs_${Date.now()}`,
      predictedMinutes: input.predictedMinutes,
      actualMinutes: input.actualMinutes,
      actualOutcome: input.actual,
      completed: input.actual.completed,
      verdict: input.actual.completed === false ? 'REFUTED' : 'CONFIRMED',
    });
  } else {
    // Keep EXECUTED (or current) status; only advance DecisionOutcome reconciliation
    if (trace.status === 'PREVIEW' || trace.status === 'SELECTED') {
      causalTrace.bindExecuted({
        traceId: ref.traceId,
        executionRef: input.outcomeRef ?? trace.executionRef ?? `obs_exec_${Date.now()}`,
        actualOutcome: input.actual,
      });
    } else {
      causalTrace.bindExecuted({
        traceId: ref.traceId,
        executionRef: input.outcomeRef ?? trace.executionRef ?? `obs_exec_${Date.now()}`,
        actualOutcome: input.actual,
      });
    }
  }

  return causalTrace.getTrace(ref.traceId)?.travelCausalDecision;
}
