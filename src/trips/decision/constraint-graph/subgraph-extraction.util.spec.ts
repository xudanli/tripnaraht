import { extractConstrainedSubgraph } from './subgraph-extraction.util';
import { GLOBAL_SPATIOTEMPORAL_GRAPH_SCHEMA_V1 } from './global-spatiotemporal-graph.types';

describe('extractConstrainedSubgraph', () => {
  const globalGraph = {
    schemaVersion: GLOBAL_SPATIOTEMPORAL_GRAPH_SCHEMA_V1,
    countryCode: 'IS',
    emittedAt: '2026-05-29T00:00:00Z',
    nodes: [
      { id: 'reykjavik', kind: 'PLACE' as const, countryCode: 'IS', label: 'Reykjavik', properties: {} },
      {
        id: 'f208',
        kind: 'F_ROAD_GATE' as const,
        countryCode: 'IS',
        label: 'F208',
        properties: { requires4x4: true, maxSlopePct: 28 },
        validity: { openMonths: [6, 7, 8] },
      },
    ],
    edges: [
      { id: 'e1', kind: 'CONNECTS_TO' as const, fromNodeId: 'reykjavik', toNodeId: 'f208' },
    ],
    stats: { nodeCount: 2, edgeCount: 1, byKind: {} },
  };

  it('prunes seasonal F-road in October for 2WD', () => {
    const result = extractConstrainedSubgraph(globalGraph, {
      countryCode: 'IS',
      anchorNodeIds: ['reykjavik', 'f208'],
      month: 10,
      vehicleType: '2WD',
      maxSlopePct: 20,
    });
    expect(result.prunedNodeIds).toContain('f208');
  });
});
