import { buildTravelRuntimeGraphFromReplan } from './types/travel-runtime-graph.types';

describe('travel-runtime-graph', () => {
  it('builds runtime graph from replan result', () => {
    const graph = buildTravelRuntimeGraphFromReplan({
      tripId: 't1',
      trigger: {
        factType: 'ROAD',
        entityRef: { kind: 'ROAD', id: 'F208' },
        value: { isOpen: false },
        source: 'physical_validator',
        observedAt: '2026-06-15T10:00:00.000Z',
        confidence: 0.9,
      },
      impact: {
        rootEntity: { kind: 'ROAD', id: 'F208' },
        rootFactType: 'ROAD',
        rootConfidence: 0.9,
        affected: [
          {
            entityRef: { kind: 'SEGMENT', id: 'd1' },
            riskLevel: 'HIGH',
            message: 'drive blocked',
            recommendation: 'ADJUST',
            propagationHop: 1,
            cascadeConfidence: 0.765,
            netImpactMinutes: 30,
          },
        ],
      },
      coverage: {
        summary: 'test',
        uncoveredCapabilities: ['INVENTORY'],
        coveredFactTypes: ['ROAD'],
        sourcesUsed: ['physical_validator'],
        disclosedAt: '2026-06-15T10:01:00.000Z',
      },
      analyzedAt: '2026-06-15T10:01:00.000Z',
    });

    expect(graph.version).toBe('tripnara/travel-runtime-graph/v1');
    expect(graph.nodes.length).toBe(2);
    expect(graph.edges.length).toBe(1);
    expect(graph.impact.affected[0].netImpactMinutes).toBe(30);
  });
});
