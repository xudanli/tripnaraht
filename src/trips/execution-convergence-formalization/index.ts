export type {
  ConvergenceManifold,
  ExecutionFixedPoint,
  ExecutionStateSnapshot,
} from './execution-convergence.types';
export type { ConvergenceSemanticsOptions, ExecutionConvergenceState } from './convergence-semantics.types';
export {
  computeNeptuneResidualDelta,
  compositeInstability,
  evaluateSinglePassConvergence,
  evaluateTwoPassConvergence,
  manifoldViolation,
  stabilityManifoldScore,
} from './evaluate-convergence';
export {
  buildExecutionStateSnapshot,
  computeExecutionStateHash,
  evaluateFixedPoint,
  shouldContinueIteration,
} from './execution-fixed-point';
export { buildConvergenceManifold } from './execution-convergence-manifold';
export type { ConvergenceProofSketch } from './convergence-proof.types';
export { buildConvergenceProofSketch } from './convergence-proof-sketch';
export { computeLyapunovSurrogate, isLyapunovNonIncreasing } from './lyapunov-surrogate';
export { detectResidualDivergence } from './divergence-detector';
