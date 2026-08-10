/**
 * 极昼马拉松：回填 trip SKU、Gate SOFT 违规（纯函数，从 ClaudeOrchestrator 迁出）。
 */

import type { RouteAndRunRequestDto } from '../dto/route-and-run.dto';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';
import {
  applyMarathonIntakeSignalsToTripPlan,
  buildMarathonIntakeSignalsFromGaps,
  enrichGateForMarathonDeferredLowerBound,
} from '../utils/marathon-intake-signals.util';

export function applyMarathonPipelineSignals(
  state: OrchestratorState,
  request: RouteAndRunRequestDto,
): void {
  if (!state.trip_plan_request) return;
  const intakeMsg =
    request.message ??
    (state.metadata as { intake_user_message?: string } | undefined)?.intake_user_message;
  const signals = buildMarathonIntakeSignalsFromGaps(
    state.gaps,
    state.trip_plan_request,
    intakeMsg,
  );
  if (!signals) return;

  state.trip_plan_request = applyMarathonIntakeSignalsToTripPlan(
    state.trip_plan_request,
    signals,
    intakeMsg,
  );
  (state.metadata as Record<string, unknown>).marathon_intake_signals = signals;

  if (state.gate_result) {
    state.gate_result = enrichGateForMarathonDeferredLowerBound(
      state.gate_result,
      state.trip_plan_request,
      state.gaps,
      intakeMsg,
    );
  }
}
