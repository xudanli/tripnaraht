/**
 * P-ECO-Closure-8 — Self-referential semantics & recursive cognition (audit layer).
 */

export type { SelfModel } from './self-model.types';
export type { ComputationalIdentity } from './computational-identity.types';
export type { NeptuneReflectiveSemanticAugmentation } from './neptune-reflective-output.types';
export {
  evaluateRecursiveReasoning,
  type RecursiveReasoningAssessment,
} from './recursive-evaluator';
export {
  evaluateRecursiveBoundary,
  DEFAULT_REFLECTIVE_MAX_DEPTH,
  type RecursiveBoundaryResult,
} from './recursive-boundary';
export { buildSemanticTrustCore, type SemanticTrustCore } from './semantic-trust-core';
export { buildSelfModel } from './build-self-model';
export { buildComputationalIdentity } from './build-computational-identity';
export {
  buildP8EcoClosureAugmentation,
  type P8EcoClosureAugmentation,
} from './build-p8-eco-closure';
