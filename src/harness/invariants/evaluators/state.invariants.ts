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

/** RFC-003 §9.6 — state invariants */
export const STATE_INVARIANTS: ContextInvariantDefinition[] = [
  {
    invariantId: 'CTX-STATE-001',
    domain: 'plan',
    severity: 'BLOCKER',
    description: '一个 Context 只能存在一个 effectivePlan 真相',
    evaluate: ({ after }) => {
      const plan = after.plan.effectivePlan;
      if (plan.hasEffectivePlan && !plan.versionId) {
        return fail(
          'CTX-STATE-001',
          'BLOCKER',
          'hasEffectivePlan=true but effectivePlan.versionId is missing',
        );
      }
      return ok('CTX-STATE-001', 'BLOCKER');
    },
  },
  {
    invariantId: 'CTX-STATE-002',
    domain: 'meta',
    severity: 'BLOCKER',
    description: 'Revision 必须单调递增',
    evaluate: ({ before, after }) => {
      if (after.meta.revision <= before.meta.revision) {
        return fail(
          'CTX-STATE-002',
          'BLOCKER',
          `Revision not monotonic: ${before.meta.revision} -> ${after.meta.revision}`,
        );
      }
      return ok('CTX-STATE-002', 'BLOCKER');
    },
  },
  {
    invariantId: 'CTX-STATE-003',
    domain: 'plan',
    severity: 'CRITICAL',
    description: 'Snapshot 不得引用不存在的 Plan Version',
    evaluate: ({ after }) => {
      const versionId = after.meta.bindings.effectivePlanVersionId;
      const planVersionId = after.plan.effectivePlan.versionId;
      if (versionId && planVersionId && versionId !== planVersionId) {
        return fail(
          'CTX-STATE-003',
          'CRITICAL',
          `bindings.effectivePlanVersionId (${versionId}) !== plan.effectivePlan.versionId (${planVersionId})`,
        );
      }
      return ok('CTX-STATE-003', 'CRITICAL');
    },
  },
];
