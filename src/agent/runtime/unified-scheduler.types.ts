/**
 * P2 — Unified scheduler contract: ECPS routing + replay eligibility + engine placement + SPCL collapse hooks.
 * Implementations live in services; this file is the interchange shape only.
 */

import type { ExecutionDecision } from '../contracts/execution-control-policy.types';

export const UNIFIED_SCHEDULER_SCHEMA = 'runtime/unified-scheduler/v1' as const;

export interface UnifiedSchedulerTickInput {
  queryId: string;
  /** Carry-forward from ECPS / gateway. */
  artifactId?: string;
  replayEligible?: boolean;
  replayConfidenceBand?: string;
  /** Request SPCL / bias collapse this tick. */
  spclCollapseRequested?: boolean;
  /** Soft hint for kernel / OFDL mode family. */
  operatorFamilyHint?: string;
  /** When set, phase ordering derives from ECPS (mode / invalidation / reuse). */
  ecpsDecision?: ExecutionDecision;
}

export interface UnifiedSchedulerTickPlan {
  schema: typeof UNIFIED_SCHEDULER_SCHEMA;
  queryId: string;
  /** Ordered phases for the executor (materialized later as graph expansion). */
  phases: Array<'ROUTE' | 'EVOLVE_PHI' | 'SHADOW' | 'SPCL' | 'PERSIST' | 'REPLAY_VERIFY'>;
  runReplayVerification: boolean;
  runSpclCollapse: boolean;
  notes: string[];
}
