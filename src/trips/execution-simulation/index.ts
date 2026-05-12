export type {
  ExecutionSimulationPlan,
  ExecutionSimulationRunResult,
  ExecutionVariant,
  ExecutionVariantPerturbation,
  SimulationDiffReport,
  SimulationDivergencePoint,
} from './execution-simulation.types';

export { applyPerturbation, cloneExecutionIR } from './apply-perturbation';

export { executeSimulation } from './execute-simulation';

export {
  computeRegret,
  diffSimulationResults,
  executionDivergenceIndex,
  findExecutionDivergence,
  scoreSimulationRun,
  selectBestByScore,
} from './simulation-diff';
