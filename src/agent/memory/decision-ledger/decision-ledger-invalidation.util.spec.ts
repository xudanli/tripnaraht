import type { DecisionLedgerSnapshot, LedgerNode, WorldAnchorV1 } from './decision-ledger.types';
import {
  applyLedgerConstraintChange,
  collectWorldAffectedRoots,
  invalidateLedgerByAnchorDrift,
  planLedgerRecomputeOrder,
} from './decision-ledger-invalidation.util';
import { normalizeLedgerAnchorsV1, serializeWorldAnchorComposite } from './decision-ledger-world-anchor.util';

const A: LedgerNode = {
  nodeId: 'a',
  parentIds: [],
  consumesNodeIds: [],
  actionType: 'TRANSPORT',
  inputSignatures: {
    budgetAnchor: 'b0',
    preferenceAnchor: 'p0',
    worldAnchor: '',
  },
  outputRef: { kind: 't', payloadDigest: 'x' },
  status: 'STABLE',
  createdAt: 1,
};

const B: LedgerNode = {
  nodeId: 'b',
  parentIds: ['a'],
  consumesNodeIds: [],
  actionType: 'POI',
  inputSignatures: {
    budgetAnchor: 'b0',
    preferenceAnchor: 'p0',
    worldAnchor: '',
  },
  outputRef: { kind: 'p', payloadDigest: 'y' },
  status: 'STABLE',
  createdAt: 2,
};

const C: LedgerNode = {
  nodeId: 'c',
  parentIds: [],
  consumesNodeIds: ['b'],
  actionType: 'ACCOMMODATION',
  inputSignatures: {
    budgetAnchor: 'b0',
    preferenceAnchor: 'p0',
    worldAnchor: '',
  },
  outputRef: { kind: 'h', payloadDigest: 'z' },
  status: 'STABLE',
  createdAt: 3,
};

function snap(nodes: LedgerNode[], anchors?: Partial<LedgerAnchorsV1>): DecisionLedgerSnapshot {
  const cloned = nodes.map(n => JSON.parse(JSON.stringify(n)) as LedgerNode);
  const defaultWl: WorldAnchorV1 = {
    coarseDigest: 'c0',
    fineDigest: 'f0',
    activeTopics: {},
  };
  const merged = normalizeLedgerAnchorsV1({
    budget: 'b0',
    preference: 'p0',
    policy: 'pol0',
    worldLayered: defaultWl,
    ...(anchors ?? {}),
  });
  for (const n of cloned) {
    if (!n.inputSignatures.worldAnchor) {
      n.inputSignatures.worldAnchor = merged.world;
    }
  }
  return { revision: 'v1', nodes: cloned, edges: [], anchors: merged };
}

describe('decision-ledger-invalidation', () => {
  it('applyLedgerConstraintChange BUDGET cascades dependents', () => {
    const ledger = snap([A, B, C]);
    const { ledger: next } = applyLedgerConstraintChange(ledger, { kind: 'BUDGET', newBudgetAnchor: 'b1' });
    expect(next.nodes.find(n => n.nodeId === 'a')?.status).toBe('INVALIDATED');
    expect(next.nodes.find(n => n.nodeId === 'b')?.status).toBe('INVALIDATED');
    expect(next.nodes.find(n => n.nodeId === 'c')?.status).toBe('INVALIDATED');
    expect(next.anchors.budget).toBe('b1');
  });

  it('WORLD change uses SOFT cascade', () => {
    const wl0: WorldAnchorV1 = {
      coarseDigest: 'w0',
      fineDigest: 'f0',
      activeTopics: { t1: 'd1' },
    };
    const anchors0 = normalizeLedgerAnchorsV1({
      budget: 'b0',
      preference: 'p0',
      policy: 'pol0',
      worldLayered: wl0,
    });
    const ledger = snap(
      [
        {
          ...A,
          nodeId: 'w1',
          inputSignatures: {
            ...A.inputSignatures,
            worldAnchor: anchors0.world,
          },
          invalidationPolicy: { world: 'normal' },
        },
      ],
      anchors0,
    );
    const wl1: WorldAnchorV1 = { ...wl0, coarseDigest: 'w9' };
    const { ledger: next, staleNodeIds } = applyLedgerConstraintChange(ledger, {
      kind: 'WORLD',
      newWorldLayered: wl1,
    });
    expect(next.nodes[0]?.status).toBe('STALE');
    expect(staleNodeIds).toContain('w1');
  });

  it('applyLedgerConstraintChange WORLD is HARD under GATE_EVAL', () => {
    const wl0: WorldAnchorV1 = {
      coarseDigest: 'w0',
      fineDigest: 'f0',
      activeTopics: { t1: 'd1' },
    };
    const anchors0 = normalizeLedgerAnchorsV1({
      budget: 'b0',
      preference: 'p0',
      policy: 'pol0',
      worldLayered: wl0,
    });
    const ledger = snap(
      [
        {
          ...A,
          nodeId: 'w2',
          inputSignatures: {
            ...A.inputSignatures,
            worldAnchor: anchors0.world,
          },
          invalidationPolicy: { world: 'normal' },
        },
      ],
      anchors0,
    );
    const wl1: WorldAnchorV1 = { ...wl0, coarseDigest: 'w9' };
    const { ledger: next, invalidatedNodeIds } = applyLedgerConstraintChange(
      ledger,
      { kind: 'WORLD', newWorldLayered: wl1 },
      { memoryPhase: 'GATE_EVAL' },
    );
    expect(invalidatedNodeIds).toContain('w2');
    expect(next.nodes[0]?.status).toBe('INVALIDATED');
  });

  it('invalidateLedgerByAnchorDrift marks budget mismatch', () => {
    const n: LedgerNode = {
      ...A,
      nodeId: 'n1',
      inputSignatures: { ...A.inputSignatures, budgetAnchor: 'old', worldAnchor: '' },
    };
    const ledger = snap([n], { budget: 'new' });
    const n0 = ledger.nodes[0]!;
    n0.inputSignatures.worldAnchor = ledger.anchors.world;
    const { ledger: next, invalidatedNodeIds } = invalidateLedgerByAnchorDrift(ledger);
    expect(invalidatedNodeIds).toContain('n1');
    expect(next.nodes[0]?.status).toBe('INVALIDATED');
  });

  it('invalidationPolicy none skips preference/world drift when budget matches', () => {
    const ledger = snap(
      [
        {
          ...A,
          nodeId: 'l2',
          invalidationPolicy: { preference: 'none', world: 'none', policy: 'none' },
          inputSignatures: {
            budgetAnchor: 'match',
            preferenceAnchor: 'different_pref',
            worldAnchor: '',
          },
        },
      ],
      { budget: 'match', preference: 'anchors_pref' },
    );
    ledger.nodes[0]!.inputSignatures.worldAnchor = ledger.anchors.world;
    const { invalidatedNodeIds, staleNodeIds } = invalidateLedgerByAnchorDrift(ledger);
    expect(invalidatedNodeIds).toHaveLength(0);
    expect(staleNodeIds).toHaveLength(0);
  });

  it('planLedgerRecomputeOrder respects dependency chain', () => {
    const inv = (n: LedgerNode) => ({ ...n, status: 'INVALIDATED' as const });
    const base = snap([A, B, C]);
    const ledger = {
      ...base,
      nodes: [inv({ ...A, inputSignatures: { ...A.inputSignatures, worldAnchor: base.anchors.world } }), inv({ ...B, inputSignatures: { ...B.inputSignatures, worldAnchor: base.anchors.world } }), inv({ ...C, inputSignatures: { ...C.inputSignatures, worldAnchor: base.anchors.world } })],
    };
    const plan = planLedgerRecomputeOrder(ledger);
    expect(plan.orderedNodeIds).toEqual(['a', 'b', 'c']);
    expect(plan.unorderedFallbackNodeIds).toHaveLength(0);
  });

  it('planLedgerRecomputeOrder reports fallback on cycle', () => {
    const base = snap([]);
    const wx: LedgerNode = {
      nodeId: 'x',
      parentIds: ['y'],
      consumesNodeIds: [],
      actionType: 'TRANSPORT',
      inputSignatures: {
        budgetAnchor: 'b',
        preferenceAnchor: 'p',
        worldAnchor: base.anchors.world,
      },
      outputRef: { kind: 't', payloadDigest: '1' },
      status: 'INVALIDATED',
      createdAt: 1,
    };
    const wy: LedgerNode = {
      nodeId: 'y',
      parentIds: ['x'],
      consumesNodeIds: [],
      actionType: 'TRANSPORT',
      inputSignatures: {
        budgetAnchor: 'b',
        preferenceAnchor: 'p',
        worldAnchor: base.anchors.world,
      },
      outputRef: { kind: 't', payloadDigest: '2' },
      status: 'INVALIDATED',
      createdAt: 2,
    };
    const ledger = { ...base, nodes: [wx, wy] };
    const plan = planLedgerRecomputeOrder(ledger);
    expect(plan.orderedNodeIds.length + plan.unorderedFallbackNodeIds.length).toBe(2);
    expect(plan.unorderedFallbackNodeIds.length).toBeGreaterThan(0);
  });

  it('collectWorldAffectedRoots marks all nodes when coarse digest changes', () => {
    const oldW: WorldAnchorV1 = { coarseDigest: 'c0', fineDigest: 'f0', activeTopics: { t: '1' } };
    const newW: WorldAnchorV1 = { coarseDigest: 'c1', fineDigest: 'f0', activeTopics: { t: '1' } };
    const ledger = snap(
      [
        {
          ...A,
          inputSignatures: { ...A.inputSignatures, worldAnchor: serializeWorldAnchorComposite(oldW) },
          invalidationPolicy: { world: 'normal' },
        },
        {
          ...B,
          inputSignatures: { ...B.inputSignatures, worldAnchor: serializeWorldAnchorComposite(oldW) },
          invalidationPolicy: { world: 'normal' },
        },
      ],
      normalizeLedgerAnchorsV1({ budget: 'b0', preference: 'p0', policy: 'p', worldLayered: oldW }),
    );
    const roots = collectWorldAffectedRoots(ledger.nodes, oldW, newW);
    expect(roots.has('a')).toBe(true);
    expect(roots.has('b')).toBe(true);
  });

  it('invalidateLedgerByAnchorDrift uses HARD for world-only drift when memoryPhase is GATE_EVAL', () => {
    const wl0: WorldAnchorV1 = { coarseDigest: 'c0', fineDigest: 'f0', activeTopics: {} };
    const anchors0 = normalizeLedgerAnchorsV1({ budget: 'b0', preference: 'p0', policy: 'pol0', worldLayered: wl0 });
    const n: LedgerNode = {
      ...A,
      nodeId: 'g1',
      inputSignatures: { ...A.inputSignatures, worldAnchor: anchors0.world },
      invalidationPolicy: { world: 'normal' },
    };
    const wl1: WorldAnchorV1 = { ...wl0, fineDigest: 'f1' };
    const anchors1 = normalizeLedgerAnchorsV1({ budget: 'b0', preference: 'p0', policy: 'pol0', worldLayered: wl1 });
    const ledger: DecisionLedgerSnapshot = {
      revision: 'v1',
      nodes: [n],
      edges: [],
      anchors: anchors1,
    };
    const { invalidatedNodeIds, staleNodeIds } = invalidateLedgerByAnchorDrift(ledger, { memoryPhase: 'GATE_EVAL' });
    expect(invalidatedNodeIds).toContain('g1');
    expect(staleNodeIds).toHaveLength(0);
  });
});
