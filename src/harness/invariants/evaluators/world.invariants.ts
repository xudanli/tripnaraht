import type { ContextInvariantDefinition } from '../invariant.types';

function ok(id: string, severity: ContextInvariantDefinition['severity'], message?: string) {
  return { invariantId: id, pass: true, severity, message };
}

function fail(
  id: string,
  severity: ContextInvariantDefinition['severity'],
  message: string,
) {
  return { invariantId: id, pass: false, severity, message };
}

/** RFC-003 §9.6 — world fact invariants */
export const WORLD_INVARIANTS: ContextInvariantDefinition[] = [
  {
    invariantId: 'CTX-WORLD-001',
    domain: 'world',
    severity: 'CRITICAL',
    description: '触发决策的世界事实必须带来源和 observedAt',
    evaluate: ({ after, trace }) => {
      if (!trace.changedDomains.includes('world')) {
        return ok('CTX-WORLD-001', 'CRITICAL');
      }
      const newFacts = after.world.facts.filter(
        (f) => f.replanTrigger || f.type === 'ROAD_CLOSED',
      );
      for (const fact of newFacts) {
        if (!fact.observedAt?.trim() || !fact.sourceId?.trim()) {
          return fail(
            'CTX-WORLD-001',
            'CRITICAL',
            `World fact ${fact.factId} missing observedAt or sourceId`,
          );
        }
      }
      return ok('CTX-WORLD-001', 'CRITICAL');
    },
  },
];
