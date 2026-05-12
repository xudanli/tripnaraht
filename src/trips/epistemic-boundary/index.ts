/**
 * P-ECO-Closure-9 — Epistemic limits & incompleteness boundary (bounded cognition audit).
 */

export type { EpistemicLimit } from './epistemic-limit.types';
export type { UnprovableExecutionProperty } from './godel-boundary';
export { listUnprovableExecutionProperties } from './godel-boundary';
export {
  evaluateConfidenceHorizon,
  type ConfidenceHorizonResult,
} from './confidence-horizon';
export { evaluateProofBoundary, type ProofBoundary } from './proof-incompleteness';
export type { EpistemicAssessment } from './neptune-epistemic-assessment.types';
export { buildEpistemicLimit } from './build-epistemic-limit';
export {
  buildP9EcoClosureAugmentation,
  type P9EcoClosureAugmentation,
} from './build-p9-eco-closure';
