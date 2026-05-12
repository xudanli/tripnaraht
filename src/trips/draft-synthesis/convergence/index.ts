export type {
  ConvergenceResult,
  ConvergencePolicy,
  ConvergenceMode,
  GlobalWinnerStrategy,
  DivergenceArea,
  DivergenceKind,
} from './convergence.types';
export { DEFAULT_CONVERGENCE_POLICY } from './convergence.types';
export { computeDualEngineConvergence } from './convergence.engine';
