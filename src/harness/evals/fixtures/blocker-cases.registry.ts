import type { BlockerCaseDefinition } from '../blockers/blocker-case.schema';

/** Release blockers — 6 cases, 7 Jest tests (STATE-BLOCKER-PARTIAL-001: Path A + Path B). LOOP-BLOCKER-INFINITE-001 deferred P2. */
export const BLOCKER_CASE_REGISTRY: BlockerCaseDefinition[] = [
  {
    caseId: 'DS-BLOCKER-IDEMPOTENCY-001',
    title: 'Plan B duplicate apply idempotency',
    description:
      'Applying the same repair decision twice must produce one effective itinerary mutation and one effective decision application.',
    suite: 'blockers',
    domain: 'side-effects',
    dimensions: ['TaskSuccess', 'StateConsistency', 'Observability'],
    phase: 'P0',
    tags: ['decision-semantics', 'idempotency'],
  },
  {
    caseId: 'MEM-BLOCKER-SCOPE-001',
    title: 'CURRENT_TRIP constraint must not leak across trips',
    description:
      'A CURRENT_TRIP constraint must influence only its owning trip and must not appear in any assembled context for another trip.',
    suite: 'blockers',
    domain: 'memory',
    dimensions: ['MemoryIsolation', 'PolicyCompliance'],
    phase: 'P0',
    tags: ['constraint-sink', 'scope'],
  },
  {
    caseId: 'MEM-BLOCKER-DELETE-001',
    title: 'Deleted constraint must not be recalled in any layer',
    description:
      'After Memory Console DELETE of a trip constraint patch, the fact must not appear in canonical store, cache, snapshot head, vector recall, or assembled context.',
    suite: 'blockers',
    domain: 'memory',
    dimensions: ['MemoryIsolation', 'PolicyCompliance', 'Observability'],
    phase: 'P0',
    tags: ['constraint-sink', 'delete', 'forgetting'],
  },
  {
    caseId: 'STATE-BLOCKER-PARTIAL-001',
    title: 'Post-apply route recalc failure must not fake APPLIED',
    description:
      'When applyRepair persists but post-apply route recalculation fails, outcome must be ROLLED_BACK or PARTIALLY_APPLIED — never EXECUTED/APPLIED.',
    suite: 'blockers',
    domain: 'state',
    dimensions: ['StateConsistency', 'Recoverability', 'Observability'],
    phase: 'P1',
    tags: ['decision-semantics', 'partial-apply', 'rollback'],
  },
  {
    caseId: 'POLICY-BLOCKER-STALE-001',
    title: 'DATA_STALE must block auto-repair',
    description:
      'When supporting repair evidence is stale, applyRepair must not run and decision must not reach EXECUTED/APPLIED; response must require evidence refresh.',
    suite: 'blockers',
    domain: 'policy',
    dimensions: ['PolicyCompliance', 'TaskSuccess'],
    phase: 'P1',
    tags: ['decision-semantics', 'data-stale', 'evidence-freshness'],
  },
  {
    caseId: 'MEM-BLOCKER-PDI-001',
    title: 'Private wish must not leak to other trip members',
    description:
      'A member private wish must appear only for the owning user in digests and assembled context; other members must not receive the text or structured hints.',
    suite: 'blockers',
    domain: 'memory',
    dimensions: ['MemoryIsolation', 'PolicyCompliance'],
    phase: 'P1',
    tags: ['pdi', 'private-wish', 'multi-member'],
  },
];

export function getBlockerCase(caseId: string): BlockerCaseDefinition | undefined {
  return BLOCKER_CASE_REGISTRY.find((c) => c.caseId === caseId);
}
