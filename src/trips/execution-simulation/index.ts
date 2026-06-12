export type {
  ExecutionSimulationPlan,
  ExecutionSimulationRunResult,
  ExecutionVariant,
  ExecutionVariantPerturbation,
  SimulationDiffReport,
  SimulationDivergencePoint,
} from './execution-simulation.types';

export type {
  AlignmentDiscardReason,
  AlignmentTier3Batch,
  CausalAlignmentTuple,
} from './alignment-tier3.types';

export { inferAlignmentPenalties } from './alignment-tier3.types';

export type {
  BottleneckPrimaryRisk,
  ContingencyPlan,
  EnhancedSimulationPlan,
  RobustnessBottleneck,
  RobustnessPerturbationKind,
  RobustnessRolloutResult,
  RobustnessSampleSummary,
  RobustnessSimulationConfig,
  RolloutNodeContext,
  RolloutTimelineNode,
} from './robustness-rollout.types';

export { applyPerturbation, cloneExecutionIR } from './apply-perturbation';

export { executeSimulation } from './execute-simulation';

export {
  executeRobustnessRollout,
  type RobustnessRolloutContext,
} from './execute-robustness-rollout';

export { buildRobustnessVariants, perturbationTagsForVariant } from './build-robustness-variants.util';

export { extractRolloutNodeContexts } from './extract-rollout-nodes.util';

export {
  projectRobustnessPartyFromNegotiationMemberProfiles,
  projectRobustnessPartyFromNegotiationProfiles,
  resolveRobustnessPartyFromRouteAndRunRequest,
} from './planning-party-robustness.util';

export {
  projectLatentStateFromPersona,
  projectRobustnessPartyFromPersonas,
} from './project-latent-state.util';

export {
  aggregateRobustnessRollout,
  scoreSimulationRunPenalty,
  type PerSampleSocialTrace,
  type PhysicalSampleOutcome,
} from './rollout-scorer.util';

export {
  computeRegret,
  diffSimulationResults,
  executionDivergenceIndex,
  findExecutionDivergence,
  scoreSimulationRun,
  selectBestByScore,
} from './simulation-diff';
