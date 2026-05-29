export type {
  ConstraintDomain,
  ConstraintField,
  WorldConstraintState,
  WorldTimeRange,
} from './constraint-field.interface';
export { WorldConstraintStore } from './world-constraint.store';
export type {
  WorldConstraintDiff,
} from './world-diff.engine';
export { computeWorldDiff } from './world-diff.engine';
export type {
  ApplyWorldEventOptions,
  ApplyWorldEventResult,
  WorldDomainEvent,
} from './world-constraint.pipeline';
export {
  applyWorldEvent,
  buildExecutionSemanticWorldOverlay,
  toConstraintField,
} from './world-constraint.pipeline';
export {
  worldEventsFromRagChunks,
  type RagChunksToWorldEventsOptions,
} from './rag-chunks-to-world-events.util';
export {
  materializeRagChunksToWorldStore,
  materializeWorldEventsToStore,
  type WorldConstraintMaterializationSummary,
  type MaterializeRagWorldConstraintsOptions,
} from './materialize-rag-world-constraints';
export { injectWorldStoreViolationsIntoCgusCandidates } from './inject-world-store-into-cgus-candidates.util';
export type { WorldConstraintStoreSnapshot } from './world-snapshot';
export { snapshotWorldConstraintStore } from './world-snapshot';
export type { ExecutionSemanticWorldOverlay } from './execution-semantic-world.types';
export type { WorldCommand } from './world-command.types';
export type {
  ApplyWorldCommandOptions,
  ApplyWorldCommandResult,
} from './world-command.service';
export { applyWorldCommand } from './world-command.service';
export type { CoPlanningState } from './world-collaboration.state';
export {
  runInteractiveWorldLoop,
} from './world-interactive-loop.service';
export type {
  InteractiveWorldLoopResult,
  RunInteractiveWorldLoopOptions,
} from './world-interactive-loop.service';
export type { WorldSuggestion } from './world-suggestion.engine';
export {
  suggestWorldMutationsAfterRoadBlocked,
} from './world-suggestion.engine';
export { userPhraseToWorldCommand } from './world-intent.mapper';
export type { CanonicalRoadWorldState } from './road-canonical.types';
export type { RoadConstraintDiff } from './road-constraint-diff.types';
export {
  applyRoadDiff,
} from './apply-road-diff';
export type { ApplyRoadDiffOptions } from './apply-road-diff';
export {
  roadAccessStateToCanonical,
  roadConstraintEventAndImpactToDiff,
} from './road-graph-to-ssot.mapper';
export type {
  WorldDiffStreamEvent,
  WorldDiffSource,
  WorldDiffUiType,
  WorldEditingUserOperation,
} from './world-diff-stream.types';
export {
  toWorldDiffStreamEvent,
  worldDiffContractToStreamEvent,
  toWorldDiff,
} from './world-diff-stream.mapper';
export type {
  ToWorldDiffStreamParams,
  ToWorldDiffParams,
} from './world-diff-stream.mapper';
export type {
  WorldDiff,
  WorldDiffDomain,
  WorldDiffMutationType,
  WorldDiffOrigin,
  WorldDiffPropagationHint,
} from './diff/world-diff.contract';
export {
  bookingChangeToWorldDiff,
  computePropagation,
  processWorldDiff,
  roadConstraintDiffToWorldDiff,
  weatherSignalToWorldDiff,
  worldDiffToConstraintField,
} from './diff';
export type {
  BookingToWorldDiffParams,
  ProcessWorldDiffOptions,
  ProcessWorldDiffResult,
  PropagationContext,
  RoadToWorldDiffParams,
  WeatherToWorldDiffParams,
} from './diff';
export type { WorldDiffLogEntry } from './replay/world-diff-log.types';
export { WorldDiffLogStore } from './replay/world-diff-log.store';
export { hashWorldConstraintStore } from './replay/world-state-hash';
export {
  applyWorldDiff,
  buildWorldDiffLogEntry,
  counterfactualBranch,
  createInitialWorldStore,
  reexecuteFrom,
  replayWorld,
} from './replay';
export type {
  CounterfactualWorldResult,
  RecordDiffMeta,
  ReplayWorldOptions,
} from './replay';
export {
  applyRoadFactMutation,
} from './world-mutation.gateway';
export type {
  RoadFactMutation,
  RoadWorldCommand,
  WorldRoadMutationResult,
} from './world-mutation.gateway';
export {
  evaluateConstraintFeasibility,
  evaluateConstraintFeasibilityForSlot,
} from './world-constraint-feasibility.policy';
export type {
  ConstraintFeasibilityCode,
  ConstraintFeasibilityResult,
  ConstraintFeasibilityVerdict,
  WorldConstraintFeasibilityInput,
} from './world-constraint-feasibility.types';
export type { WorldConstraintFeasibilitySlotInput } from './world-constraint-feasibility.policy';
export {
  WORLD_EDITING_SYSTEM_UI_ALIGNMENT,
  WORLD_UI_LAYER_DIFF_STREAM,
  WORLD_UI_LAYER_MAP,
  WORLD_UI_LAYER_NARRATIVE,
  WORLD_UI_LAYER_TIMELINE,
} from './world-editing-ui-paradigm';
export type {
  WorldEditingSessionViewModel,
  WorldUiLayerId,
} from './world-editing-ui-paradigm';

// Runtime OS — operational contracts, Iceland domain pipeline, world arbitrator
export {
  OperationalSeverity,
  operationalSlice,
  computeFreshness,
  maxOperationalSeverity,
  OPERATIONAL_SLICE_TTL_SECONDS,
} from './contracts/operational-severity.contract';
export type { OperationalSlice, FreshnessState } from './contracts/operational-severity.contract';
export { WorldOperationalArbitrator } from './operational/world-operational-arbitrator';
export type {
  OperationalArbitration,
  WorldOperationalArbitrationInput,
  OperationalExecutionStatus,
} from './operational/world-operational-arbitrator';
export { applyOperationalArbitrationToPolicies } from './operational/apply-arbitration-to-resolved-policies.util';
export type {
  ExecutionDecision,
  FrozenExecutionPolicyHook,
  ItineraryGenerateResultType,
  PartialExecutionState,
  RecoveryAction,
} from './operational/execution-governance.contract';
export {
  EXECUTION_POLICY_VERSION,
  composeExecutionDecision,
  cloneRecoveryActions,
  defaultExecutionDecision,
  deriveCausedByPoliciesFromArbitration,
  buildRecoveryActionsFromBlocking,
  freezeExecutionPolicyHook,
} from './operational/execution-governance.contract';
export type {
  IcelandOperationalPipelineRunInput,
  IcelandOperationalPipelineRunOutput,
} from './domains/iceland/iceland-operational-domain.pipeline';
