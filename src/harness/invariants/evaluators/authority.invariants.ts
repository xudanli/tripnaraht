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

/** RFC-003 §9.5.4 — authority invariants (trace-driven) */
export const AUTHORITY_INVARIANTS: ContextInvariantDefinition[] = [
  {
    invariantId: 'CTX-AUTH-001',
    domain: 'authority',
    severity: 'BLOCKER',
    description: '只有 Canonical Runtime 可以修改 effectivePlan',
    evaluate: ({ before, after, trace }) => {
      const planChanged =
        before.plan.effectivePlan.versionId !== after.plan.effectivePlan.versionId ||
        before.plan.effectivePlan.itemCount !== after.plan.effectivePlan.itemCount;
      if (planChanged && trace.authority.runtime !== 'CANONICAL') {
        return fail(
          'CTX-AUTH-001',
          'BLOCKER',
          `effectivePlan changed under ${trace.authority.runtime} runtime`,
        );
      }
      return ok('CTX-AUTH-001', 'BLOCKER');
    },
  },
  {
    invariantId: 'CTX-AUTH-002',
    domain: 'authority',
    severity: 'BLOCKER',
    description: 'Legacy Runtime 不得产生新有效 Revision',
    evaluate: ({ before, after, trace }) => {
      const revisionAdvanced = after.meta.revision > before.meta.revision;
      if (revisionAdvanced && trace.authority.runtime === 'LEGACY') {
        return fail(
          'CTX-AUTH-002',
          'BLOCKER',
          'Legacy runtime advanced revision',
        );
      }
      return ok('CTX-AUTH-002', 'BLOCKER');
    },
  },
  {
    invariantId: 'CTX-AUTH-003',
    domain: 'authority',
    severity: 'BLOCKER',
    description: 'Shadow Runtime 不得写入 effectivePlan / contract',
    evaluate: ({ before, after, trace }) => {
      if (trace.authority.runtime !== 'SHADOW') {
        return ok('CTX-AUTH-003', 'BLOCKER');
      }
      const planChanged =
        before.plan.effectivePlan.versionId !== after.plan.effectivePlan.versionId;
      const contractChanged =
        before.contract.constraints.length !== after.contract.constraints.length;
      if (planChanged || contractChanged) {
        return fail(
          'CTX-AUTH-003',
          'BLOCKER',
          'Shadow runtime mutated effectivePlan or contract',
        );
      }
      return ok('CTX-AUTH-003', 'BLOCKER');
    },
  },
  {
    invariantId: 'CTX-AUTH-004',
    domain: 'authority',
    severity: 'CRITICAL',
    description: '写操作必须声明 inputRevision',
    evaluate: ({ before, trace }) => {
      if (trace.inputContext.revision !== before.meta.revision) {
        return fail(
          'CTX-AUTH-004',
          'CRITICAL',
          `trace input revision ${trace.inputContext.revision} !== before ${before.meta.revision}`,
        );
      }
      return ok('CTX-AUTH-004', 'CRITICAL');
    },
  },
  {
    invariantId: 'CTX-AUTH-005',
    domain: 'authority',
    severity: 'CRITICAL',
    description: '输出 Revision 必须能追溯到 authorityRunId',
    evaluate: ({ after, trace }) => {
      if (
        trace.outputContext &&
        trace.outputContext.revision === after.meta.revision &&
        !trace.authorityRunId?.trim()
      ) {
        return fail('CTX-AUTH-005', 'CRITICAL', 'Missing authorityRunId for output revision');
      }
      return ok('CTX-AUTH-005', 'CRITICAL');
    },
  },
];
