import { buildLedgerEdgesFromNodes } from './decision-ledger-anchors.util';
import type { DecisionLedgerSnapshot, LedgerNode } from './decision-ledger.types';
import { assembleRecomputePayloadV1 } from './recompute-payload-assembler.util';

const stableFlight: LedgerNode = {
  nodeId: 'FLIGHT_001',
  parentIds: [],
  consumesNodeIds: [],
  actionType: 'TRANSPORT',
  inputSignatures: { budgetAnchor: 'b', preferenceAnchor: 'p', worldAnchor: 'w' },
  outputRef: { kind: 'flight', payloadDigest: 'd1', summary: 'Round-trip to Iceland confirmed.' },
  status: 'STABLE',
  createdAt: 1,
};

const invalidatedPoi: LedgerNode = {
  nodeId: 'POI_DAY2',
  parentIds: ['FLIGHT_001'],
  consumesNodeIds: [],
  actionType: 'POI',
  inputSignatures: { budgetAnchor: 'b', preferenceAnchor: 'p', worldAnchor: 'w' },
  outputRef: { kind: 'poi', payloadDigest: 'd2', summary: 'South coast beach slot' },
  status: 'INVALIDATED',
  createdAt: 2,
};

function snap(nodes: LedgerNode[]): DecisionLedgerSnapshot {
  const wl = { coarseDigest: 'c', fineDigest: 'f', activeTopics: {} };
  return {
    revision: 'v1',
    nodes: nodes.map(n => JSON.parse(JSON.stringify(n))),
    edges: buildLedgerEdgesFromNodes(nodes),
    anchors: {
      budget: 'b',
      preference: 'p',
      policy: 'pol',
      world: 'w',
      worldLayered: wl,
    },
  };
}

describe('assembleRecomputePayloadV1', () => {
  it('失效子图仅含 INVALIDATED，incomingEdges 含上游 STABLE→失效边', () => {
    const ledger = snap([stableFlight, invalidatedPoi]);
    const payload = assembleRecomputePayloadV1(ledger, {
      driftContext: [
        {
          topic: 'world:weather_windows',
          description: 'Orange weather alert in south Iceland.',
          severity: 'HARD',
        },
      ],
    });

    expect(payload.revision).toBe('v1');
    expect(payload.invalidatedSubGraph.nodes.map(n => n.nodeId)).toEqual(['POI_DAY2']);
    expect(payload.orderedTaskIds).toEqual(['POI_DAY2']);
    expect(payload.stableAnchorNodes).toEqual([
      {
        nodeId: 'FLIGHT_001',
        summary: 'Round-trip to Iceland confirmed.',
        actionType: 'TRANSPORT',
      },
    ]);
    expect(payload.invalidatedSubGraph.incomingEdges).toContainEqual({
      from: 'FLIGHT_001',
      to: 'POI_DAY2',
      kind: 'parent',
    });
    expect(payload.driftContext[0].topic).toBe('world:weather_windows');
  });

  it('edges 为空时回退为由节点合成的边表', () => {
    const ledger = snap([stableFlight, invalidatedPoi]);
    const noEdgeLedger: DecisionLedgerSnapshot = { ...ledger, edges: [] };
    const payload = assembleRecomputePayloadV1(noEdgeLedger);
    expect(payload.invalidatedSubGraph.incomingEdges.length).toBeGreaterThan(0);
  });

  it('无 summary 时用 payloadDigest 生成占位摘要', () => {
    const bare: LedgerNode = {
      ...stableFlight,
      nodeId: 'X',
      outputRef: { kind: 'k', payloadDigest: 'abcdef123456' },
    };
    const inv: LedgerNode = {
      ...invalidatedPoi,
      nodeId: 'Y',
      parentIds: ['X'],
      consumesNodeIds: [],
    };
    const ledger = snap([bare, inv]);
    const payload = assembleRecomputePayloadV1(ledger);
    expect(payload.stableAnchorNodes[0].summary).toMatch(/^digest:/);
  });
});
