/**
 * Canonical Authority Harness — case schema (Sprint Authority Audit).
 * Deterministic assertions only; LLM grader MUST NOT gate release.
 */

export type AuthorityCasePhase = 'P0' | 'P1';

export type AuthorityAssertionLayer =
  | 'routing'
  | 'constraint_gateway'
  | 'memory_snapshot'
  | 'decision_ledger'
  | 'trip_version'
  | 'write_guard'
  | 'trace'
  | 'api';

export interface AuthorityCaseDefinition {
  caseId: string;
  title: string;
  description: string;
  phase: AuthorityCasePhase;
  routeClasses: string[];
  orchestrationModes: string[];
  tags?: string[];
}

export type AuthorityAssertionResult = {
  layer: AuthorityAssertionLayer;
  name: string;
  pass: boolean;
  expected?: unknown;
  actual?: unknown;
  message?: string;
};

export type AuthorityCaseResult = {
  caseId: string;
  pass: boolean;
  assertions: AuthorityAssertionResult[];
  errors: string[];
  startedAt: string;
  finishedAt: string;
  /** RFC-003 H-P0 — Revision-bound execution anchor when Context snapshot provided */
  executionAnchor?: import('../../protocol/execution-anchor.types').HarnessExecutionAnchor;
};

export function mergeAuthorityResults(results: AuthorityCaseResult[]): {
  pass: boolean;
  total: number;
  failed: string[];
  results: AuthorityCaseResult[];
} {
  const failed = results.filter((r) => !r.pass).map((r) => r.caseId);
  return {
    pass: failed.length === 0,
    total: results.length,
    failed,
    results,
  };
}
