export type { AgentRole, AgentContribution, ConflictKind, ConstraintViolation } from './agent.types';
export type { PlanConstraintReport } from './constraint-report.types';
export type {
  MultiAgentNegotiationInput,
  MultiAgentNegotiationResult,
  ConflictResolutionLogEntry,
} from './negotiation.types';
export { buildHeuristicConstraintReports } from './constraint-reports.heuristic';
export { defaultAgentContributions } from './agent-contributions';
export { runMultiAgentNegotiation, toParetoPlans } from './negotiation.engine';
