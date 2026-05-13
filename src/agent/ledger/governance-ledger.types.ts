/**
 * Persistent Governance Ledger — execution causality & system behavior history.
 * Event taxonomy is layered for future Policy Evolution vs World drift analysis.
 */

import type { ExecutionDecision, RecoveryAction } from '../../world/operational/execution-governance.contract';

/** L1 = operational execution surface; L2 = policy engine; L3 = world signals (ingested separately later). */
export type GovernanceEventLevel = 'L1_operational' | 'L2_policy' | 'L3_world';

/** Append-only event types (extend over time; stored as TEXT in DB). */
export type GovernanceLedgerEventType =
  // L1 operational
  | 'execution_block'
  | 'reroute'
  | 'delay_departure'
  | 'route_suppressed'
  | 'recovery_suggested'
  // L2 policy
  | 'policy_generated'
  | 'policy_override'
  | 'policy_restriction'
  | 'severity_upgraded'
  | 'governance_branch_selected'
  | 'governance_branch_outcome'
  | 'governance_runtime_transition'
  | 'governance_resolution_event'
  // L3 world
  | 'storm_detected'
  | 'road_closed'
  | 'weather_escalated'
  | 'official_warning_issued';

export interface GovernanceLedgerEvent {
  id: string;
  tripId?: string;
  timestamp: number;
  eventLevel: GovernanceEventLevel;
  eventType: GovernanceLedgerEventType;
  /** Correlates multiple ledger rows within one planner / orchestration hop. */
  correlationId: string;
  /** Groups sub-causes (world + policy + planner) for one user-visible outcome. */
  causalityChainId: string;
  executionDecision: ExecutionDecision;
  causedByPolicies: string[];
  policyVersion: string;
  affectedSubsystems: string[];
  recoveryActions?: RecoveryAction[];
  executionContextSummary?: {
    countryCode?: string;
    routeRegion?: string;
    vehicleType?: string;
  };
}

export interface GovernanceHistoryQuery {
  tripId?: string;
  sinceTimestamp?: number;
  eventTypes?: GovernanceLedgerEventType[];
  eventLevels?: GovernanceEventLevel[];
  routeRegion?: string;
  limit?: number;
}

export interface GovernanceStateDiff {
  /** Human-readable lines for UI / logs. */
  summaryLines: string[];
  baseline?: Pick<GovernanceLedgerEvent, 'timestamp' | 'eventType' | 'executionDecision' | 'causedByPolicies'>;
  current?: Pick<GovernanceLedgerEvent, 'timestamp' | 'eventType' | 'executionDecision' | 'causedByPolicies'>;
  /** Heuristic hints (e.g. weather codes in causedByPolicies). */
  narrativeHints: string[];
}
