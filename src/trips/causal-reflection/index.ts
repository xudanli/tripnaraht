export type {
  CausalEvidence,
  CausalModel,
  CausalModelMeta,
  CausalModelOrigin,
  ModelPatch,
} from './causal-model.types';

export {
  applyModelPatches,
  causalModelToGraph,
  graphToCausalModel,
  reviseModel,
} from './causal-model-rewriter';

export { detectCausalDrift, type CausalDriftReport, type DetectCausalDriftInput } from './drift-detector';

export {
  attachReflectiveCausalToProof,
  runReflectiveSelfUpdate,
  type SelfUpdateLoopResult,
} from './self-update-loop';
