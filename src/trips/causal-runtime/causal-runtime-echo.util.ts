/**
 * Echo causal runtime artifacts for API clients (Decision Engine / frontend join).
 */

import type { TripWorldState } from '../decision/world-model';

export function buildCausalRuntimeEcho(state: TripWorldState): {
  lastDecisionCausalityId?: string;
  icelandSelfDriveCausalAssessment?: TripWorldState['signals']['icelandSelfDriveCausalAssessment'];
  causalPersonaProjection?: TripWorldState['signals']['causalPersonaProjection'];
  icelandCausalCalibration?: TripWorldState['signals']['icelandCausalCalibration'];
  causalCounterfactualSnapshot?: TripWorldState['signals']['causalCounterfactualSnapshot'];
} {
  const payload: ReturnType<typeof buildCausalRuntimeEcho> = {};
  const id = state.signals?.lastDecisionCausalityId?.trim();
  if (id) payload.lastDecisionCausalityId = id;
  if (state.signals?.icelandSelfDriveCausalAssessment) {
    payload.icelandSelfDriveCausalAssessment = state.signals.icelandSelfDriveCausalAssessment;
  }
  if (state.signals?.causalPersonaProjection) {
    payload.causalPersonaProjection = state.signals.causalPersonaProjection;
  }
  if (state.signals?.icelandCausalCalibration) {
    payload.icelandCausalCalibration = state.signals.icelandCausalCalibration;
  }
  if (state.signals?.causalCounterfactualSnapshot) {
    payload.causalCounterfactualSnapshot = state.signals.causalCounterfactualSnapshot;
  }
  return payload;
}
