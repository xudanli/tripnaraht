import type { DecisionLedgerSnapshot, LedgerNode } from './decision-ledger.types';
import { normalizeLedgerAnchorsV1 } from './decision-ledger-world-anchor.util';
import { TimelineLedgerLogicConstraintValidator } from './ledger-timeline-logic-constraint.validator';

const wl = { coarseDigest: 'c0', fineDigest: 'f0', activeTopics: { t1: 'd1' } };

function anchors() {
  return normalizeLedgerAnchorsV1({
    budget: 'b0',
    preference: 'p0',
    policy: 'pol0',
    worldLayered: wl,
  });
}

function alignedSig(a: ReturnType<typeof anchors>) {
  return {
    budgetAnchor: a.budget,
    preferenceAnchor: a.preference,
    policyAnchor: a.policy,
    worldAnchor: a.world,
    worldCoarseDigestAtCommit: a.worldLayered.coarseDigest,
    worldTopicDigestsAtCommit: { ...a.worldLayered.activeTopics },
  };
}

function ledgerOf(nodes: LedgerNode[]): DecisionLedgerSnapshot {
  const a = anchors();
  const cloned = nodes.map(n => ({
    ...JSON.parse(JSON.stringify(n)) as LedgerNode,
    inputSignatures: { ...alignedSig(a), ...n.inputSignatures },
    invalidationPolicy: n.invalidationPolicy ?? {
      budget: 'normal',
      preference: 'normal',
      world: 'normal',
      policy: 'normal',
    },
  }));
  return { revision: 'v1', nodes: cloned, edges: [], anchors: a };
}

describe('TimelineLedgerLogicConstraintValidator', () => {
  const v = new TimelineLedgerLogicConstraintValidator();

  it('交通 arrivalEpoch 晚于住宿 checkInLatestEpoch 时标记住宿 seed', () => {
    const a = anchors();
    const t: LedgerNode = {
      nodeId: 'T1',
      parentIds: [],
      consumesNodeIds: [],
      actionType: 'TRANSPORT',
      inputSignatures: alignedSig(a),
      outputRef: { kind: 't', payloadDigest: 'x' },
      status: 'STABLE',
      createdAt: 1,
    };
    const h: LedgerNode = {
      nodeId: 'H1',
      parentIds: ['T1'],
      consumesNodeIds: [],
      actionType: 'ACCOMMODATION',
      inputSignatures: alignedSig(a),
      outputRef: { kind: 'h', payloadDigest: 'y', summary: 'Vik checkInLatestEpoch: 200' },
      status: 'STABLE',
      createdAt: 2,
    };
    const ledger = ledgerOf([t, h]);
    const mergedOutputs = new Map<string, unknown>([['T1', { arrivalEpoch: 500 }]]);
    expect(v.validate({ ledger, mergedOutputs })).toEqual(['H1']);
  });

  it('时间可行时不产出 seed', () => {
    const a = anchors();
    const t: LedgerNode = {
      nodeId: 'T1',
      parentIds: [],
      consumesNodeIds: [],
      actionType: 'TRANSPORT',
      inputSignatures: alignedSig(a),
      outputRef: { kind: 't', payloadDigest: 'x' },
      status: 'STABLE',
      createdAt: 1,
    };
    const h: LedgerNode = {
      nodeId: 'H1',
      parentIds: ['T1'],
      consumesNodeIds: [],
      actionType: 'ACCOMMODATION',
      inputSignatures: alignedSig(a),
      outputRef: { kind: 'h', payloadDigest: 'y', summary: 'checkInLatestEpoch=800' },
      status: 'STABLE',
      createdAt: 2,
    };
    const ledger = ledgerOf([t, h]);
    const mergedOutputs = new Map<string, unknown>([['T1', { arrivalEpoch: 500 }]]);
    expect(v.validate({ ledger, mergedOutputs })).toEqual([]);
  });
});
