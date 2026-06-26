export type {
  TripIntervention,
  TripInterventionType,
  TripInterventionExpectedEffect,
  TripInterventionSideEffect,
  MechanismEvidenceTier,
} from './trip-intervention.types';

export type {
  CausalDecisionTuple,
  CausalDecisionContextSnapshot,
  CausalFailureHypothesis,
  CausalExpectedOutcome,
  CausalActualOutcome,
  CAUSAL_DECISION_TUPLE_SCHEMA_V1,
} from './causal-decision-tuple.types';

export {
  mapWhatIfActionToTripIntervention,
  mapCausalInterventionToTripIntervention,
  mapActuatorActionToTripIntervention,
} from './trip-intervention.mapper';

export type {
  DecisionCausalityRecord,
  DecisionCausalityRecordV1,
  DECISION_CAUSALITY_SCHEMA_V1,
} from './decision-causality-v1.types';
export { isDecisionCausalityRecordV1 } from './decision-causality-v1.types';

export {
  buildCausalDecisionTupleFromTick,
  upgradeToDecisionCausalityRecordV1,
  finalizeDecisionCausalityRecordV1,
  buildBlockedAtGateCausalityRecordV1,
} from './decision-causality-v1';

export type {
  CausalVariableBinding,
  WhatIfCausalProjection,
  PlanBInterventionPayloadV1,
  TrustInterventionEffect,
} from './what-if-intervention.types';
export { PLAN_B_INTERVENTION_PAYLOAD_SCHEMA } from './what-if-intervention.types';

export {
  buildWhatIfCausalProjection,
  enrichWhatIfCandidateWithIntervention,
  enrichWhatIfReport,
  tripInterventionToTrustEffects,
  buildPlanBInterventionPayload,
  serializePlanBInterventionPayload,
  parsePlanBInterventionPayload,
  formatInterventionSummaryForTrustSurface,
} from './what-if-intervention.builder';

export {
  buildDecisionCausalityTravelEventEnvelope,
  buildDecisionCausalityIdempotencyKey,
  TRAVEL_EVENT_CAUSALITY_SCHEMA_VERSION,
} from './travel-event-causality.builder';

export { CausalTravelEventEmitterService } from './causal-travel-event.emitter.service';
export { CausalRuntimeModule } from './causal-runtime.module';

export type {
  IcelandSelfDriveCausalInput,
  IcelandSelfDriveCausalOutput,
  IcelandTravelTimeDistribution,
} from './domains/iceland-self-drive-causal.types';
export {
  runIcelandSelfDriveCausalAnalysis,
  computeTravelTimeDistribution,
  windToSpeedFactor,
  slackToMissProbability,
  recommendShiftMinutes,
} from './domains/iceland-self-drive-causal.engine';
export {
  analyzeIcelandSelfDriveLeg,
  analyzeIcelandWithShift,
  buildIcelandInputFromTravelLeg,
  enrichTravelEstimateWithWindP90,
  mergeIcelandCausalIntoProjection,
} from './domains/iceland-causal-bridge';
export {
  attachIcelandAssessmentToState,
  buildIcelandAssessmentFromTripState,
  isIcelandDestination,
} from './domains/trip-world-state-iceland-causal.util';
export { formatIcelandSelfDriveAssessment, formatMinutesZh } from './domains/iceland-self-drive-narrative.util';

export type {
  CausalPersonaProjection,
  CausalPersonaSlice,
  CausalPersonaName,
} from './persona/causal-persona-projection.types';
export {
  CAUSAL_PERSONA_PROJECTION_SCHEMA,
  PLAN_STATE_CAUSAL_PERSONA_KEY,
} from './persona/causal-persona-projection.types';
export {
  buildCausalPersonaProjection,
  attachCausalPersonaToPlanState,
  readCausalPersonaFromPlanState,
} from './persona/build-causal-persona-projection';
export {
  isCausalPersonaKernelEnabled,
  shouldSkipLlmGuardianEval,
} from './persona/causal-persona-kernel.config';
export { mapCausalProjectionToGuardianEvaluation } from './persona/map-causal-persona-to-guardian.util';
export { buildCausalRuntimeEcho } from './causal-runtime-echo.util';

export type {
  Gate1FulfillmentCausalInput,
  Gate1FulfillmentCausalOutput,
  Gate1FulfillmentBlockerInput,
} from './domains/gate1-fulfillment-causal.types';
export {
  runGate1FulfillmentCausalAnalysis,
  buildFulfillmentInputFromReadinessFindings,
} from './domains/gate1-fulfillment-causal.engine';

export type {
  CausalCounterfactualReport,
  CausalCounterfactualSnapshot,
  CausalOutcomeObservation,
} from './counterfactual/causal-counterfactual.types';
export {
  CAUSAL_COUNTERFACTUAL_REPORT_SCHEMA,
  CAUSAL_COUNTERFACTUAL_SNAPSHOT_SCHEMA,
} from './counterfactual/causal-counterfactual.types';
export {
  runCausalCounterfactualClosure,
  updateIcelandCalibration,
  reviseReflectiveModelFromCounterfactual,
} from './counterfactual/run-causal-counterfactual-closure';
export {
  applyCounterfactualClosureToWorldState,
  attachActualOutcomeToCausalityRecord,
} from './counterfactual/apply-counterfactual-to-world-state';
export { CausalCounterfactualClosureService } from './causal-counterfactual-closure.service';
export {
  buildCounterfactualTravelEventEnvelope,
  buildCounterfactualIdempotencyKey,
} from './travel-event-counterfactual.builder';
export type { IcelandCausalCalibration } from './domains/iceland-causal-calibration.types';
export {
  extractCausalObservationFromOpsOutcome,
  CAUSAL_OBSERVATION_EXTENSION_SCHEMA,
} from './counterfactual/extract-causal-observation-from-ops-outcome.util';
export { isCausalCounterfactualOnOpsOutcomeEnabled } from './counterfactual/causal-counterfactual-kernel.config';

export type {
  CausalRuntimeSessionSnapshot,
  CaptureCausalRuntimeSessionInput,
} from './causal-runtime-session.types';
export { CausalRuntimeSessionService } from './causal-runtime-session.service';
export { enrichOpsOutcomeWithSession } from './enrich-ops-outcome-with-session.util';
export { resolveOpsRealitySnapshotId } from './resolve-ops-reality-snapshot-id.util';
export { cloneTripWorldState } from './clone-trip-world-state.util';
