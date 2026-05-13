/**
 * Governance Runtime Graph (GRG) — directed causal topology over ledger events (v1 heuristics).
 */

export type GovernanceRuntimeNodeLevel = 'world' | 'policy' | 'execution' | 'recovery';

export interface GovernanceRuntimeNode {
  nodeId: string;
  eventId: string;
  level: GovernanceRuntimeNodeLevel;
  timestamp: number;
  tripId?: string;
}

export type GovernanceRuntimeEdgeType =
  | 'caused'
  | 'suppressed'
  | 'recovered'
  | 'overrode'
  | 'runtime_state_transition'
  | 'recovery_validated'
  | 'recovery_resumed';

export interface GovernanceRuntimeEdge {
  fromNodeId: string;
  toNodeId: string;
  edgeType: GovernanceRuntimeEdgeType;
  confidence?: number;
}

export interface GovernanceRuntimeGraph {
  nodes: GovernanceRuntimeNode[];
  edges: GovernanceRuntimeEdge[];
}
