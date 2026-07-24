import type { AuthorityCaseDefinition } from './authority-case.schema';

/** Authority Harness SSOT — 8 cases aligned with CANONICAL_AUTHORITY_AUDIT.md §6 */
export const AUTHORITY_CASE_REGISTRY: AuthorityCaseDefinition[] = [
  {
    caseId: 'AU-P0-001',
    title: 'Legacy must not bypass hard constraints',
    description:
      'When SM breaker opens and LEGACY runs with a road-closure scenario, response must be BLOCK/NEED_CONFIRMATION — never a directly writable effective plan.',
    phase: 'P0',
    routeClasses: ['FULL_DEEP_PLAN', 'PARTIAL_REPLAN'],
    orchestrationModes: ['LEGACY'],
    tags: ['legacy-fallback', 'constraint-gateway', 'safety'],
  },
  {
    caseId: 'AU-P0-002',
    title: 'Fast Path must not write itinerary without authority chain',
    description:
      'Fast paths may read or invoke tools, but any Trip mutation requires Decision ID → Constraint Evaluation → Trip Version → Write Guard.',
    phase: 'P0',
    routeClasses: ['QUICK_ANSWER', 'FAST_PATH'],
    orchestrationModes: ['CLAUDE_DYNAMIC', 'Agentic'],
    tags: ['fast-path', 'write-guard'],
  },
  {
    caseId: 'AU-P0-003',
    title: 'Async resume must re-validate freshness',
    description:
      'After async worker resume, if trip version changed or evidence snapshot expired, commit must fail — not submit stale results.',
    phase: 'P0',
    routeClasses: ['FULL_DEEP_PLAN', 'PARTIAL_REPLAN'],
    orchestrationModes: ['ASYNC_WORKER'],
    tags: ['async', 'trip-version', 'evidence-freshness'],
  },
  {
    caseId: 'AU-P1-004',
    title: 'Duplicate idempotency_key must not double-write',
    description:
      'Same idempotency_key twice → one trip version bump, second returns first result, ledger has one decision.',
    phase: 'P1',
    routeClasses: ['PARTIAL_REPLAN'],
    orchestrationModes: ['CLAUDE_SM'],
    tags: ['idempotency', 'side-effects'],
  },
  {
    caseId: 'AU-P1-005',
    title: 'Replay must not re-invoke LLM',
    description:
      'replay_from_trace with strict seal uses frozen memory, tool results, LLM activity, evidence — no fresh model calls.',
    phase: 'P1',
    routeClasses: ['FULL_DEEP_PLAN'],
    orchestrationModes: ['CLAUDE_SM'],
    tags: ['replay', 'determinism'],
  },
  {
    caseId: 'AU-P1-006',
    title: 'Concurrent edit must surface EXECUTION_CONFLICT',
    description:
      'User edits Day 3 while async agent replans; commit with stale version returns conflict — no silent overwrite.',
    phase: 'P1',
    routeClasses: ['PARTIAL_REPLAN'],
    orchestrationModes: ['ASYNC_WORKER', 'CLAUDE_SM'],
    tags: ['trip-version', 'concurrency'],
  },
  {
    caseId: 'AU-P1-007',
    title: 'Three orchestration modes share safety verdict',
    description:
      'Same hard-constraint fixture on CLAUDE_SM, CLAUDE_DYNAMIC, LEGACY: executable/confirm/write/violation codes must match.',
    phase: 'P1',
    routeClasses: ['FULL_DEEP_PLAN'],
    orchestrationModes: ['CLAUDE_SM', 'CLAUDE_DYNAMIC', 'LEGACY'],
    tags: ['parity', 'constraint-gateway'],
  },
  {
    caseId: 'AU-P1-008',
    title: 'Decision Ledger records full closure',
    description:
      'One adjustment records Problem → Evidence → Constraints → Candidates → Evaluation → Selected → Rejected → Plan Change → Execution Status.',
    phase: 'P1',
    routeClasses: ['PARTIAL_REPLAN', 'FULL_DEEP_PLAN'],
    orchestrationModes: ['CLAUDE_SM'],
    tags: ['decision-ledger', 'closure'],
  },
];

export function getAuthorityCase(caseId: string): AuthorityCaseDefinition | undefined {
  return AUTHORITY_CASE_REGISTRY.find((c) => c.caseId === caseId);
}
