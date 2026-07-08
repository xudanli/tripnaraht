import { evaluateContextInvariants, listContextInvariantIds } from './context-invariant.registry';
import { buildIcelandPlanningContextFixture } from '../evals/fixtures/contexts/iceland-planning.fixture';
import type { ContextAuthorityTrace } from '../protocol/execution-anchor.types';

describe('context-invariant.registry', () => {
  it('registers CTX-STATE and CTX-AUTH invariants', () => {
    const ids = listContextInvariantIds();
    expect(ids).toContain('CTX-STATE-001');
    expect(ids).toContain('CTX-AUTH-001');
    expect(ids.length).toBeGreaterThanOrEqual(8);
  });

  it('CTX-STATE-002 fails when revision does not advance', () => {
    const before = buildIcelandPlanningContextFixture();
    const after = buildIcelandPlanningContextFixture({
      meta: { ...before.meta, revision: before.meta.revision },
    });

    const trace: ContextAuthorityTrace = {
      authorityRunId: 'run_test',
      inputContext: { snapshotId: before.meta.snapshotId, revision: before.meta.revision },
      authority: { runtime: 'CANONICAL', gateway: 'test', policyVersion: 'v1' },
      outputContext: { snapshotId: after.meta.snapshotId, revision: after.meta.revision },
      changedDomains: [],
    };

    const results = evaluateContextInvariants({
      invariantIds: ['CTX-STATE-002'],
      before,
      after,
      trace,
    });

    expect(results[0]?.pass).toBe(false);
  });

  it('CTX-AUTH-001 fails when LEGACY mutates effective plan', () => {
    const before = buildIcelandPlanningContextFixture();
    const after = buildIcelandPlanningContextFixture({
      plan: {
        ...before.plan,
        effectivePlan: {
          ...before.plan.effectivePlan,
          versionId: 'pv_mutated',
        },
      },
      meta: {
        ...before.meta,
        revision: before.meta.revision + 1,
        bindings: {
          ...before.meta.bindings,
          effectivePlanVersionId: 'pv_mutated',
        },
      },
    });

    const trace: ContextAuthorityTrace = {
      authorityRunId: 'run_legacy',
      inputContext: { snapshotId: before.meta.snapshotId, revision: before.meta.revision },
      authority: { runtime: 'LEGACY', gateway: 'legacy', policyVersion: 'v1' },
      outputContext: { snapshotId: after.meta.snapshotId, revision: after.meta.revision },
      changedDomains: ['plan'],
    };

    const results = evaluateContextInvariants({
      invariantIds: ['CTX-AUTH-001', 'CTX-AUTH-002'],
      before,
      after,
      trace,
    });

    expect(results.find((r) => r.invariantId === 'CTX-AUTH-001')?.pass).toBe(false);
    expect(results.find((r) => r.invariantId === 'CTX-AUTH-002')?.pass).toBe(false);
  });
});
