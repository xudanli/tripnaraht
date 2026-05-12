export type {
  ExecutionSimulationReport,
  ExecutionSimulationIssue,
  ExecutionSimulationDimensions,
  ExecutionSimulationRecommendation,
  SimulationIssueType,
  SimulationSeverity,
} from './execution-simulation.types';
export { runExecutionSimulation, type RunExecutionSimulationParams } from './execution-simulation.engine';
