export type {
  WorldDiff,
  WorldDiffDomain,
  WorldDiffMutationType,
  WorldDiffOrigin,
  WorldDiffPropagationHint,
} from './world-diff.contract';
export {
  computePropagation,
} from './world-diff-propagation';
export type { PropagationContext } from './world-diff-propagation';
export { worldDiffToConstraintField } from './world-diff-materialize';
export {
  processWorldDiff,
  type ProcessWorldDiffOptions,
  type ProcessWorldDiffResult,
} from './world-diff.processor';
export {
  roadConstraintDiffToWorldDiff,
  type RoadToWorldDiffParams,
} from './adapters/road-world-diff.adapter';
export {
  weatherSignalToWorldDiff,
  type WeatherToWorldDiffParams,
} from './adapters/weather-world-diff.adapter';
export {
  bookingChangeToWorldDiff,
  type BookingToWorldDiffParams,
} from './adapters/booking-world-diff.adapter';
