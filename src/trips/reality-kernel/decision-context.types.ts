/**
 * Snapshot-bound decision context (Phase 3 — Reality Enforcement spine).
 * Decision paths should converge on receiving DecisionContext instead of ad-hoc service reads.
 */

import type { RealityReadPolicy } from './reality-read-policy.types';
import { DEFAULT_REALITY_READ_POLICY } from './reality-read-policy.types';
import type { RealitySnapshotV0 } from './reality-snapshot.types';

export const DECISION_CONTEXT_SCHEMA_V0 = 'tripnara/decision-context/v0' as const;

export interface PlanningHorizonIso {
  start_at: string;
  end_at: string;
}

/**
 * Root reference for a single planning / repair tick: official reality slice + horizon.
 */
export interface DecisionContextV0 {
  schema: typeof DECISION_CONTEXT_SCHEMA_V0;
  snapshot_id: string;
  reality: RealitySnapshotV0;
  planning_horizon: PlanningHorizonIso;
  /** Enforcement generation — evolves with gates */
  enforcement: 'bound_v0';
  /** How live adapters may relate to this snapshot when reads occur */
  read_policy?: RealityReadPolicy;
  /**
   * Execution Gate — set during planning/repair after policy evaluation.
   * DEGRADED: adapters must not treat live provider reads as authoritative (use heuristic / snapshot-only paths).
   */
  execution_runtime_mode?: 'NORMAL' | 'DEGRADED';
  /** Set only when Gate resolves DEGRADE — unified degrade semantics for adapters. */
  execution_degrade_strategy?: import('./execution-gate.types').DegradeStrategy;
}

export const DEFAULT_DECISION_READ_POLICY = DEFAULT_REALITY_READ_POLICY;
