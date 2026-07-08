import type { DecisionLedgerSnapshot } from '../../../agent/memory/decision-ledger/decision-ledger.types';
import {
  buildDecisionLedgerCausalityConsoleV1,
  mergeLedgerNodeToDecisionIdMaps,
} from './decision-ledger-console-read.util';
import {
  enrichLedgerHealingObsWithDecisionCausality,
  mergeDecisionLedgerCausalityIntoMemoryContractObs,
} from './merge-decision-ledger-memory-contract.util';

describe('decision-ledger-console-read', () => {
  it('merges trip metadata index with ledger caused_by edges', () => {
    const ledger: DecisionLedgerSnapshot = {
      revision: 'v1',
      nodes: [],
      edges: [{ from: 'decision:dec_a', to: 'n_ledger', kind: 'caused_by' }],
      anchors: {
        budget: 'b',
        preference: 'p',
        policy: 'pol',
        world: 'w',
        worldLayered: { coarseDigest: 'c', fineDigest: 'f', activeTopics: {} },
      },
    };

    const out = buildDecisionLedgerCausalityConsoleV1({
      tripId: 'trip1',
      fromTripMetadata: {
        ledgerNodeToDecisionId: { n_meta: 'dec_b' },
        records: [
          {
            id: 'dec_b',
            tripId: 'trip1',
            problemId: 'dp1',
            selectedOptionId: 'opt1',
            rejectedOptionIds: [],
            decidedBy: [{ role: 'TRIP_OWNER' }],
            authoritySnapshot: {
              decisionDomain: 'ROUTE',
              proposer: 'SYSTEM',
              requiredApprover: 'TRIP_OWNER',
              executionMode: 'AUTO',
              overridable: true,
            },
            reasons: [],
            decidedAt: '2026-06-30T10:00:00Z',
            tripVersionBefore: '1',
            status: 'EXECUTED',
            validationStatus: 'PENDING',
          },
        ],
      },
      ledger,
      ledgerSnapshotVersion: 3,
    });

    expect(out?.ledger_node_to_decision_id).toEqual({
      n_ledger: 'dec_a',
      n_meta: 'dec_b',
    });
    expect(out?.links.find((l) => l.ledger_node_id === 'n_meta')?.problem_id).toBe('dp1');
    expect(mergeLedgerNodeToDecisionIdMaps({ a: '1' }, { b: '2', a: '9' })).toEqual({ a: '9', b: '2' });
  });
});

describe('merge-decision-ledger-memory-contract', () => {
  const causality = buildDecisionLedgerCausalityConsoleV1({
    tripId: 'trip1',
    fromTripMetadata: { ledgerNodeToDecisionId: { POI_A: 'dec_1' } },
  })!;

  it('adds decision_ledger_causality layer to memory_contract', () => {
    const merged = mergeDecisionLedgerCausalityIntoMemoryContractObs(
      {
        revision: 'v1',
        loaded: true,
        layers: ['l1'],
        user_id_present: true,
        snapshot_id: 'snap1',
        snapshot_version: 1,
        loaded_at_iso: '2026-06-30T10:00:00Z',
      },
      causality,
    );
    expect(merged.layers).toContain('decision_ledger_causality_hydrated');
    expect(merged.decision_ledger_causality?.ledger_node_to_decision_id.POI_A).toBe('dec_1');
  });

  it('enriches ledger_healing with user_decision_by_node_id', () => {
    const enriched = enrichLedgerHealingObsWithDecisionCausality(
      {
        status: 'CONVERGED',
        affected_node_ids: ['POI_A', 'MISSING'],
        metrics: { initial_invalidated: 1, secondary_invalidated: 0, loops: 1 },
        steps: [],
      },
      causality,
    );
    expect(enriched.user_decision_by_node_id).toEqual({ POI_A: 'dec_1' });
  });
});
