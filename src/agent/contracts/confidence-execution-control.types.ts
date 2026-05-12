/**
 * Confidence-driven execution control plane — band/threshold → routing & reuse semantics.
 *
 * Phase 1: policy types + dedup gate; orchestrator/tool hooks consume the same directives later.
 */

import type { ReplayConfidenceBand } from './artifact-replay-confidence.types';

/** Coarse execution phase derived from replay confidence (governs reuse vs recompute). */
export type ConfidenceExecutionPhase =
  | 'REUSE_ARTIFACT'
  | 'LIGHTWEIGHT_VALIDATE'
  | 'PARTIAL_RECOMPUTE'
  | 'FULL_RECOMPUTE';

/**
 * Hint for tool/orchestrator depth (future: wired into MCP loop / orchestrator entry).
 * Maps the user's band → tool behavior table.
 */
export type ConfidenceToolDepthHint =
  | 'REUSE_SKIP_TOOLS'
  | 'VALIDATE_SELECTIVE_TOOLS'
  | 'FULL_TOOL_LOOP'
  | 'REORCHESTRATE';

/** Result of applying threshold policy to a confidence snapshot. */
export interface ConfidenceExecutionDirective {
  band: ReplayConfidenceBand;
  score: number;
  phase: ConfidenceExecutionPhase;
  toolDepthHint: ConfidenceToolDepthHint;
  /**
   * Whether serving a dedup cache hit without fresh execution is allowed.
   * MEDIUM depends on env / policy (see resolver).
   */
  allowDedupCacheReplay: boolean;
}
