export type {
  CompilerDriftSignal,
  DivergencePattern,
  ExecutionFailure,
  ExecutionSelfModel,
  SelfUpdateProposal,
} from './execution-self-model.types';

export type { ReflectableExecutionResult } from './reflect-input.types';

export {
  detectDAGBias,
  detectIRInefficiency,
  detectRepairOverreach,
  rankProposals,
  reflectOnExecution,
} from './execution-reflector';

export {
  applySelfUpdates,
  DEFAULT_SELF_UPDATE_DRIFT_BUDGET,
  explainSelfModificationReason,
  filterProposalsByDriftBudget,
  type ApplySelfUpdatesOptions,
  type MutablePolicySnapshot,
} from './self-update-compiler';
