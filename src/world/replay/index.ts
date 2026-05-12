export type { WorldDiffLogEntry } from './world-diff-log.types';
export { WorldDiffLogStore } from './world-diff-log.store';
export { hashWorldConstraintStore } from './world-state-hash';
export {
  applyWorldDiff,
  buildWorldDiffLogEntry,
  createInitialWorldStore,
  reexecuteFrom,
  replayWorld,
  type RecordDiffMeta,
  type ReplayWorldOptions,
} from './world-replay.engine';
export {
  counterfactualBranch,
  type CounterfactualWorldResult,
} from './world-counterfactual.engine';
