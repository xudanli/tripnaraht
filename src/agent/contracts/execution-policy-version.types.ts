/**
 * Policy Versioned Execution Runtime (PV-ER) — version graph over compiled `ExecutionPolicyIR`.
 *
 * Multiple ECPS policy snapshots coexist; selection layer picks the active interpreter per request context.
 */

import type { ExecutionPolicyIR } from './execution-policy-ir.types';

/** Rolling / offline-aggregated fitness signals for Darwinist selection (population-level). */
export interface PolicyVersionMetrics {
  successRate: number;
  avgLatency: number;
  /** 0–1 stability of artifact reuse vs recompute (higher ⇒ safer to trust reuse path). */
  replayStability: number;
  anomalyRate: number;
}

/** Node in the policy version graph (Git-like lineage). */
export interface ExecutionPolicyVersion {
  versionId: string;
  parentVersionId?: string;
  policyIR: ExecutionPolicyIR;
  compiledAt: number;
  metrics: PolicyVersionMetrics;
  /** When false, version is archived and excluded from automatic selection (still addressable by id). */
  active: boolean;
  /** Optional experiment labels (e.g. HIGH_REUSE, LOW_LATENCY) for selection bias / analytics. */
  labels?: string[];
}

export const DEFAULT_POLICY_VERSION_METRICS: PolicyVersionMetrics = {
  successRate: 1,
  avgLatency: 0,
  replayStability: 1,
  anomalyRate: 0,
};
