export type {
  ExecutionOverlayFrame,
  ExecutionOutcomeTrace,
  WeatherOverlaySeverity,
  ExecutionOverlayAnnotations,
  DerivedTemporalProjection,
  TemporalProjectionSeverity,
} from './execution-overlay-frame.types';
export { EXECUTION_OVERLAY_SCHEMA_VERSION } from './execution-overlay-frame.types';
export {
  deriveTemporalProjectionFromFrame,
  deriveTemporalProjectionsFromOverlay,
} from './derive-temporal-from-overlay';
export { stampOverlayAnnotationsFromSignals } from './stamp-overlay-annotations';
export {
  assertExecutionOverlayDecisionAllowed,
  assertOverlayOnly,
  isExecutionOverlayDecisionLockEnabled,
  planHasInboundTravelLeg,
} from './overlay-decision-policy';
export {
  buildExecutionOverlay,
  type BuildExecutionOverlayInput,
} from './build-execution-overlay';
export {
  augmentOverlayFramesWithPedestrianGaps,
  type AugmentPedestrianOptions,
} from './augment-overlay-pedestrian-gaps';
export { mergeRepairHintsIntoFrames } from './merge-repair-hints-into-frames';
export { applyPhysicsAuthorityToOverlayFrames } from './apply-physics-authority-to-overlay';
export {
  assertOverlayIsNonAuthoritative,
  type OverlayDecisionGuardInput,
} from './overlay-decision-guard';
