/**
 * P-ECO-Closure-7 — Meta-stability & self-evolving dynamics (policy-level audit).
 */

export type { MetaExecutionState } from './meta-state.types';
export type { AdaptiveLyapunov } from './adaptive-lyapunov';
export { evaluateAdaptiveLyapunov } from './adaptive-lyapunov';
export {
  evaluateMetaStabilityGuard,
  DEFAULT_META_STABILITY_LIMITS,
  type MetaStabilityGuardResult,
} from './meta-stability-guard';
export { buildMetaExecutionState } from './build-meta-execution-state';
export {
  buildP7EcoClosureAugmentation,
  type P7EcoClosureAugmentation,
} from './build-p7-eco-closure';
