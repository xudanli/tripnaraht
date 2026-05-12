/**
 * Execution Policy IR (EPIR) — verifiable intermediate representation for ECPS.
 *
 * Compiled from ETK traces + runtime bias + static constraints; interpreted at runtime
 * instead of ad-hoc branching-only logic.
 */

import type { ExecutionKernel, ExecutionToolDepth } from './execution-semantic-field.types';

/** Named tool-depth slots referenced by the interpreter (open-ended for future DSL). */
export type ToolDepthMappingKey =
  | 'INVALID_RECOMPUTE'
  | 'HIGH_VALIDATE_FALLBACK'
  | 'MEDIUM_VALIDATE'
  | 'LOW_WITH_ERRORS'
  | 'LOW_NO_ERRORS'
  | 'DEFAULT_RECOMPUTE';

/**
 * Audit / provenance rows emitted by the compiler (predicates are opaque strings until DSL lands).
 */
export interface PolicyRule {
  id: string;
  priority: number;
  /** Human-readable origin: e.g. "trace_aggregate:REPLAY_VIOLATION×3". */
  predicate: string;
  effect: 'THRESHOLD_SHIFT' | 'KERNEL_NUDGE' | 'RULE_NOTE';
  metadata?: Record<string, unknown>;
}

export interface PolicyConstraints {
  /** Clamp compiled HIGH-band reuse score floor. */
  replayReuseFloorBounds?: { min: number; max: number };
  /** Runtime post-selection: if compiled decision resolves to a forbidden kernel, compiler may tighten thresholds. */
  forbiddenKernels?: ExecutionKernel[];
  /** Safety: never enable MEDIUM→reuse shortcut in compiled artifact. */
  disallowMediumReuseShortcut?: boolean;
  /** Cap compiler-emitted rules for bounded payloads. */
  maxRules?: number;
}

/**
 * Compiled execution policy snapshot consumed by ECPS runtime (`interpretExecutionPolicyIR`).
 */
export interface ExecutionPolicyIR {
  version: string;
  compiledAt: number;
  /** Optional lineage for persistence / debugging. */
  sourceSummary?: {
    traceCount: number;
    biasFingerprint?: string;
  };

  rules: PolicyRule[];

  /**
   * Tunable scalars (after compile — includes bias/trace tightening).
   * - replayConfidenceHigh: effective minimum score for HIGH+FULL artifact reuse.
   * - replayConfidenceLow: advisory lower bound used for LOW-band heuristics.
   * - anomalyTolerance: scales ERROR-driven depth in LOW band (same semantics as PCK weight).
   */
  thresholds: {
    replayConfidenceHigh: number;
    replayConfidenceLow: number;
    anomalyTolerance: number;
  };

  /** Slot-based tool depth — interpreter picks keys by situation; kernel is always derived from features. */
  toolDepthMapping: Partial<Record<ToolDepthMappingKey | string, ExecutionToolDepth>>;

  /** Compiled MEDIUM reuse shortcut (bias / legacy bridge), still ANDed with runtime overrides in interpreter. */
  mediumReuseShortcutEnabled: boolean;
}
