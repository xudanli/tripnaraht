/**
 * TripNARA Runtime OS — shared shapes for P0 policy / gate / memory skills.
 * These are contract types for MCP and planners; implementations may evolve.
 */

export type OperationalRiskLevel = 'low' | 'medium' | 'high';

/** Output of worldState.summarize — single operational view for planners. */
export interface OperationalWorldState {
  operationalRisk: OperationalRiskLevel;
  blockingFactors: string[];
  warnings: string[];
  recommendedPolicies: string[];
  /** 0–1; lower when inputs are partial or inferred. */
  confidence: number;
}

/** Output of readiness.assess — execution gate. */
export interface ReadinessAssessOutput {
  executable: boolean;
  blockers: string[];
  warnings: string[];
  mitigationActions: string[];
}

/** Output of policy.resolve — constitution-style execution policies. */
export interface ResolvedPolicies {
  drivingPolicy: Record<string, unknown>;
  routePolicy: Record<string, unknown>;
  lodgingPolicy: Record<string, unknown>;
  riskPolicy: Record<string, unknown>;
  /**
   * Present when `operationalArbitration` was passed into policy.resolve.
   * Immutable frozen object (policyVersion / causedByPolicies / recoverySuggestions).
   */
  executionPolicyHook?: import('../../../world/operational/execution-governance.contract').FrozenExecutionPolicyHook;
}

export type {
  OperationalArbitration,
  OperationalExecutionStatus,
} from '../../../world/operational/world-operational-arbitrator';

/** Output of decision.compress — agent working memory slice. */
export interface DecisionCompressMemoryOutput {
  stableFacts: string[];
  unresolvedRisks: string[];
  rejectedOptions: string[];
  activePolicies: string[];
}
