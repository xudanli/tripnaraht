import { deriveLedgerHealingUiStateV1, LEDGER_HEALING_UI_DEFAULT_EN } from './ledger-healing-ui-state.v1';
import { buildLedgerHealingObservabilityV1 } from '../memory/decision-ledger/ledger-healing-observability.util';

describe('deriveLedgerHealingUiStateV1', () => {
  it('无 healing → IDLE', () => {
    const u = deriveLedgerHealingUiStateV1(undefined);
    expect(u.stage).toBe('IDLE');
    expect(u.progress).toBe(0);
    expect(LEDGER_HEALING_UI_DEFAULT_EN[u.headline_key]).toBeDefined();
  });

  it('NO_OP advisory → SCANNING', () => {
    const h = buildLedgerHealingObservabilityV1({
      initialInvalidatedCount: 2,
      ranBlockingReconcile: false,
      advisoryDeferred: true,
      invalidatedNodeIds: ['POI_A', 'POI_B'],
    });
    const u = deriveLedgerHealingUiStateV1(h);
    expect(u.stage).toBe('SCANNING');
    expect(u.card_node_ids).toEqual(['POI_A', 'POI_B']);
  });

  it('CONVERGED + 次生 → HEALED + dependents 子文案键', () => {
    const h = buildLedgerHealingObservabilityV1({
      initialInvalidatedCount: 1,
      ranBlockingReconcile: true,
      invalidatedNodeIds: ['POI_REYNISFJARA'],
      reconcileResult: {
        status: 'CONVERGED',
        trace: ['loop_0: merged=1 secondary=1 stable=false', 'converged: snapshot_version=2'],
      },
    });
    const u = deriveLedgerHealingUiStateV1(h);
    expect(u.stage).toBe('HEALED');
    expect(u.progress).toBe(100);
    expect(u.subline_key).toBe('healing.ui.smart_trip.healed.adjusted_dependents');
  });

  it('ESCALATED_HARD_CONSTRAINT → FAILED + hard 文案', () => {
    const h = buildLedgerHealingObservabilityV1({
      initialInvalidatedCount: 1,
      ranBlockingReconcile: true,
      reconcileResult: {
        status: 'ESCALATED_HARD_CONSTRAINT',
        trace: ['escalate_hard_constraint: ids=[HOTEL_VIK]'],
      },
    });
    const u = deriveLedgerHealingUiStateV1(h);
    expect(u.stage).toBe('FAILED');
    expect(u.headline_key).toBe('healing.ui.smart_trip.needs_confirmation');
    expect(u.card_node_ids).toContain('HOTEL_VIK');
  });
});
