import type { DecisionLedgerSnapshot } from '../../../agent/memory/decision-ledger/decision-ledger.types';
import {
  buildCausedByEdges,
  buildLedgerNodeToDecisionIndex,
  decisionLedgerAnchorId,
  mergeCausedByEdges,
  nodeIdsForCausalityAnnotation,
  parseDecisionIdFromLedgerAnchor,
  resolveDecisionIdFromLedgerNode,
} from './decision-ledger-causality.util';
import type { DecisionLedgerRefs } from '../types/decision-semantics.types';

function miniLedger(edges: DecisionLedgerSnapshot['edges']): DecisionLedgerSnapshot {
  return {
    revision: 'v1',
    nodes: [{ nodeId: 'n1', parentIds: [], consumesNodeIds: [], actionType: 'POI', inputSignatures: { budgetAnchor: 'b', preferenceAnchor: 'p', worldAnchor: 'w' }, outputRef: { kind: 'poi', payloadDigest: 'd' }, status: 'STABLE', createdAt: 1 }],
    edges,
    anchors: {
      budget: 'b',
      preference: 'p',
      policy: 'pol',
      world: 'w',
      worldLayered: { coarseDigest: 'c', fineDigest: 'f', activeTopics: {} },
    },
  };
}

describe('decision-ledger-causality', () => {
  const refs: DecisionLedgerRefs = {
    sourceNodeIds: ['n1'],
    invalidatedNodeIds: ['n2'],
    recomputedNodeIds: ['n3'],
    ledgerRunId: 'lr_dec_1',
  };

  it('builds caused_by edges from decision anchor', () => {
    const edges = buildCausedByEdges('dec_abc', ['n1', 'n2']);
    expect(edges).toEqual([
      { from: 'decision:dec_abc', to: 'n1', kind: 'caused_by' },
      { from: 'decision:dec_abc', to: 'n2', kind: 'caused_by' },
    ]);
  });

  it('nodeIdsForCausalityAnnotation dedupes all ref lists', () => {
    expect(nodeIdsForCausalityAnnotation(refs).sort()).toEqual(['n1', 'n2', 'n3']);
  });

  it('mergeCausedByEdges is idempotent', () => {
    const edges = buildCausedByEdges('dec_1', ['n1']);
    const ledger = miniLedger([]);
    const once = mergeCausedByEdges(ledger, edges);
    const twice = mergeCausedByEdges(once, edges);
    expect(twice.edges).toHaveLength(1);
  });

  it('resolveDecisionIdFromLedgerNode reads caused_by edge', () => {
    const ledger = miniLedger(buildCausedByEdges('dec_xyz', ['n1']));
    expect(resolveDecisionIdFromLedgerNode(ledger, 'n1')).toBe('dec_xyz');
    expect(parseDecisionIdFromLedgerAnchor(decisionLedgerAnchorId('dec_xyz'))).toBe('dec_xyz');
  });

  it('buildLedgerNodeToDecisionIndex maps all caused_by targets', () => {
    const ledger = miniLedger(buildCausedByEdges('dec_a', ['n1', 'n2']));
    expect(buildLedgerNodeToDecisionIndex(ledger)).toEqual({ n1: 'dec_a', n2: 'dec_a' });
  });
});
