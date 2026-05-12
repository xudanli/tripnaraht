export type { RewriteOperation } from './rewrite-operation.types';
export type {
  RewriteSimulation,
  RewriteSimulationVerdict,
  RewriteKind,
  RewriteSimulationProjectedSignals,
  RewriteSimulationConstraintDelta,
} from './rewrite-simulation.types';
export {
  evaluateRewriteSimulation,
  type EvaluateRewriteSimulationInput,
} from './evaluate-rewrite-simulation';
export {
  evaluateRewriteCommitReadiness,
  type RewriteCommitContext,
  type RewriteCommitReadiness,
} from './rewrite-commit-gates';
export {
  resolveAffectedTemporalSubgraphPlaceholder,
  type AffectedTemporalSubgraph,
} from './affected-subgraph.stub';
