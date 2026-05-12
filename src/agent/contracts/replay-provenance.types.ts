/**
 * Replay provenance — epistemic metadata for why a cached response may or may not be reused.
 * Enables replay validity checks (freshness drift, planner/policy upgrades) without a single hammer version.
 */

import type { RuntimeExecutionProfile } from './runtime-execution-profile.types';
import type { WorldFreshnessVector } from './world-freshness.types';

export interface ReplayProvenance {
  /** Snapshot of RuntimeExecutionProfile at generation time (if present on response). */
  executionProfile?: RuntimeExecutionProfile;
  /** World freshness vector stamped when the entry was produced (from request options at write time). */
  freshness?: WorldFreshnessVector;
  /** Broad cognitive domains touched by that run (optional; future: dependency graph). */
  cognitionDomains?: string[];
  /** Unix ms when this replay entry was stored. */
  generatedAt?: number;
  /** Primary model identifier used for generation (when observable). */
  sourceModel?: string;
  /** Planner / pipeline semver or build id. */
  plannerVersion?: string;
  /** Policy / gate bundle version for policy-safe replay decisions. */
  policySnapshotVersion?: string;
  /** Legacy aggregate coherence check (optional hammer alongside freshness vector). */
  aggregateWorldStateVersion?: string;
}
