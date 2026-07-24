/**
 * Decision Lab feature flags — re-export from runtime config SSOT.
 */

export {
  isDecisionLabEnabled,
  resolveOptimizationStrategyMode,
  type OptimizationStrategyMode,
} from '../decision-runtime/constraints/constraint-evaluation.config';

export {
  resolveCpSatSolverEngine,
  isCpSatLabEngineEnabled,
} from '../decision-runtime/optimization/engines/cp-sat-engine.resolver';

export type { CpSatSolverEngineId } from '../decision-runtime/optimization/engines/cp-sat-engine.types';
