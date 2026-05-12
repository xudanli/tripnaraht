export type {
  UserIntentState,
  UserShortTermIntent,
  UserLongTermProfile,
  UserBehaviorMemory,
} from './user-intent-state.types';
export type {
  BehaviorSignal,
  BehaviorSignalType,
  FatigueRejectionSignal,
  PaceComplaintSignal,
  DistanceOverrideSignal,
  ExplicitPlaceSignal,
} from './behavior-signal.types';
export {
  createDefaultUserIntentState,
  applyBehaviorSignal,
  applyAccumulatedFatigueRule,
} from './intent-evolution.engine';
