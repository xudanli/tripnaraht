/**
 * Release Blocker Case Schema — Harness Eval SSOT
 *
 * Suite A (blockers): deterministic assertions only. LLM grader MUST NOT gate release.
 */

export type BlockerSuiteTier = 'blockers' | 'regression';

export type BlockerDomain =
  | 'policy'
  | 'side-effects'
  | 'state'
  | 'recovery'
  | 'memory'
  | 'observability';

/** Which harness quality dimension this case primarily guards */
export type BlockerQualityDimension =
  | 'TaskSuccess'
  | 'PolicyCompliance'
  | 'StateConsistency'
  | 'Recoverability'
  | 'Observability'
  | 'MemoryIsolation';

export type BlockerAssertionLayer =
  | 'api'
  | 'itinerary_state'
  | 'decision_semantics'
  | 'event_store'
  | 'memory_canonical'
  | 'memory_cache'
  | 'memory_snapshot'
  | 'assembled_context'
  | 'policy'
  | 'trace';

/**
 * A release blocker case definition. Tests implement `run` and populate `BlockerCaseResult`.
 */
export interface BlockerCaseDefinition {
  caseId: string;
  title: string;
  description: string;
  suite: BlockerSuiteTier;
  domain: BlockerDomain;
  dimensions: BlockerQualityDimension[];
  /** Minimum implementation phase before this case is required in CI */
  phase: 'P0' | 'P1' | 'P2';
  tags?: string[];
}

export type BlockerAssertionResult = {
  layer: BlockerAssertionLayer;
  name: string;
  pass: boolean;
  expected?: unknown;
  actual?: unknown;
  message?: string;
};

export type BlockerCaseResult = {
  caseId: string;
  pass: boolean;
  assertions: BlockerAssertionResult[];
  errors: string[];
  startedAt: string;
  finishedAt: string;
};

export function mergeBlockerResults(results: BlockerCaseResult[]): {
  pass: boolean;
  total: number;
  failed: string[];
  results: BlockerCaseResult[];
} {
  const failed = results.filter((r) => !r.pass).map((r) => r.caseId);
  return {
    pass: failed.length === 0,
    total: results.length,
    failed,
    results,
  };
}

export function assertBlockerLayer(
  layer: BlockerAssertionLayer,
  name: string,
  condition: boolean,
  expected?: unknown,
  actual?: unknown,
  message?: string,
): BlockerAssertionResult {
  return {
    layer,
    name,
    pass: condition,
    expected,
    actual,
    message: condition ? undefined : message ?? `Assertion failed: ${name}`,
  };
}
