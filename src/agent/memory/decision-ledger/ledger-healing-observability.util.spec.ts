import { buildLedgerHealingObservabilityV1 } from './ledger-healing-observability.util';
import type { ReconcileResultV1 } from './incremental-recompute-orchestrator.types';

describe('buildLedgerHealingObservabilityV1', () => {
  it('阻塞 reconcile 收敛 → CONVERGED + metrics + steps', () => {
    const reconcileResult: ReconcileResultV1 = {
      status: 'CONVERGED',
      trace: ['loop_0: merged=1 secondary=0 stable=false', 'converged: snapshot_version=3'],
    };
    const h = buildLedgerHealingObservabilityV1({
      initialInvalidatedCount: 2,
      ranBlockingReconcile: true,
      reconcileResult,
    });
    expect(h.status).toBe('CONVERGED');
    expect(h.reconcile_status).toBe('CONVERGED');
    expect(h.metrics).toEqual({
      initial_invalidated: 2,
      secondary_invalidated: 0,
      loops: 1,
    });
    expect(h.steps).toHaveLength(2);
    expect(h.steps[0].phase).toBe('merge_loop');
  });

  it('解析失败 → ESCALATED + reconcile_status 透传', () => {
    const h = buildLedgerHealingObservabilityV1({
      initialInvalidatedCount: 1,
      ranBlockingReconcile: true,
      reconcileResult: {
        status: 'PARSE_ERROR',
        trace: ['parse_error: no_decisions_payload_found'],
      },
    });
    expect(h.status).toBe('ESCALATED');
    expect(h.reconcile_status).toBe('PARSE_ERROR');
  });

  it('透传 invalidatedNodeIds → affected_node_ids', () => {
    const h = buildLedgerHealingObservabilityV1({
      initialInvalidatedCount: 2,
      ranBlockingReconcile: true,
      invalidatedNodeIds: ['A', 'B', 'A'],
      reconcileResult: { status: 'CONVERGED', trace: ['converged: snapshot_version=1'] },
    });
    expect(h.affected_node_ids).toEqual(['A', 'B']);
  });

  it('advisory 相位未跑阻塞 reconcile → NO_OP', () => {
    const h = buildLedgerHealingObservabilityV1({
      initialInvalidatedCount: 3,
      ranBlockingReconcile: false,
      advisoryDeferred: true,
    });
    expect(h.status).toBe('NO_OP');
    expect(h.metrics.loops).toBe(0);
    expect(h.steps[0].action).toContain('deferred');
  });
});
