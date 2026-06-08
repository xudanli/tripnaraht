import type { ConstraintReport, DecisionState } from '../../decision/kernel/decision-state.types';
import { orchestratorStateToDecisionStatePatch } from '../../decision/kernel/orchestrator-state-mapper';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import { detectItineraryAdjustIntent, isItineraryFullTripReplanMetadata } from './itinerary-adjust-intent.util';
import type { RouteAndRunIntentAnalysis } from './route-and-run-intent-analyzer.util';

/** 将 OrchestratorState.gate_result / trip_plan_request 补齐到 DSO，供 PLAN_GEN Harness 准入。 */
export function ensureHarnessPlanningInputsOnDecisionState(
  decisionState: DecisionState | undefined,
  state: OrchestratorState,
): DecisionState | undefined {
  if (!decisionState) return decisionState;

  const fromOrchestrator = orchestratorStateToDecisionStatePatch(state);
  let next = decisionState;

  const ui = next.userIntent;
  if (
    (!ui || Object.keys(ui).length === 0) &&
    fromOrchestrator.userIntent &&
    Object.keys(fromOrchestrator.userIntent).length > 0
  ) {
    next = { ...next, userIntent: fromOrchestrator.userIntent };
  }

  if (!next.constraints?.gateOutcome) {
    if (fromOrchestrator.constraints?.gateOutcome) {
      next = { ...next, constraints: fromOrchestrator.constraints };
    } else if (isImplicitAllowForBoundTripAdjust(state)) {
      next = { ...next, constraints: buildImplicitAllowConstraints() };
    }
  }

  return next;
}

function isImplicitAllowForBoundTripAdjust(state: OrchestratorState): boolean {
  if (state.gate_result?.gate_result === 'BLOCK') return false;

  const md = state.metadata as Record<string, unknown> | undefined;
  if (md?.itinerary_adjust_intake === true) return hasBoundTripId(state);
  if (isItineraryFullTripReplanMetadata(md)) return hasBoundTripId(state);

  const routeIntent = md?.route_and_run_intent as RouteAndRunIntentAnalysis | undefined;
  if (routeIntent?.primary === 'ITINERARY_ADJUST') return hasBoundTripId(state);

  const intakeMsg = String(md?.intake_user_message ?? state.trip_plan_request?.message ?? '');
  if (detectItineraryAdjustIntent(intakeMsg) && hasBoundTripId(state)) return true;

  return false;
}

function hasBoundTripId(state: OrchestratorState): boolean {
  const md = state.metadata as Record<string, unknown> | undefined;
  return Boolean(
    state.trip_plan_request?.trip_id?.trim() ??
      state.trip_plan_request?.ontology_context?.trip_id?.trim() ??
      String(md?.tripId ?? '').trim(),
  );
}

function buildImplicitAllowConstraints(): ConstraintReport {
  return {
    feasible: true,
    violations: [],
    gateOutcome: 'ALLOW',
  };
}
