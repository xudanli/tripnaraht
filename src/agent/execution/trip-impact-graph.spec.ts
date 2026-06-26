import { assessRiskImpacts, buildTripImpactEdges } from './trip-impact-graph';

describe('trip-impact-graph', () => {
  const ctx = {
    requestId: 'r1',
    itinerary: {
      request_id: 'r1',
      days: [
        {
          date: '2026-06-14',
          items: [
            { id: 'flight-1', type: 'FLIGHT', metadata: { duration_minutes: 120 } },
            { id: 'transfer-1', type: 'DRIVE', metadata: { duration_minutes: 45, buffer_minutes: 30 } },
            { id: 'poi-1', type: 'POI', location_ref: { place_id: 'p1' }, metadata: { duration_minutes: 90 } },
          ],
        },
        {
          date: '2026-06-15',
          items: [{ id: 'poi-2', type: 'POI', location_ref: { place_id: 'p2' }, metadata: { duration_minutes: 60 } }],
        },
      ],
    },
  } as any;

  it('builds adjacent time dependency edges', () => {
    const edges = buildTripImpactEdges(ctx);
    expect(edges.some((e) => e.from === 'flight-1' && e.to === 'transfer-1' && e.dependency === 'TIME_DEPENDENCY')).toBe(true);
    expect(edges.some((e) => e.from === 'transfer-1' && e.to === 'poi-1' && e.dependency === 'TIME_DEPENDENCY')).toBe(true);
  });

  it('propagates flight disruption into downstream same-day items', () => {
    const impacts = assessRiskImpacts(
      [
        {
          id: 'flight-risk',
          category: 'TRANSPORT_DISRUPTION',
          urgency: 5,
          entityRef: { type: 'FLIGHT', id: 'CA123' },
          message: 'cancelled',
          source: { provider: 'test', sourceType: 'COMMERCIAL' },
          observedAt: '2026-06-14T08:00:00.000Z',
          confidence: 0.9,
        },
      ],
      ctx,
    );

    expect(impacts[0].affectedItems).toEqual(expect.arrayContaining(['flight-1', 'transfer-1']));
    expect(impacts[0].affectedDays).toContain('2026-06-14');
    expect(impacts[0].recommendedActions).toEqual(expect.arrayContaining(['ADD_BUFFER', 'REORDER', 'ASK_USER']));
    expect(impacts[0].rootConfidence).toBe(0.9);
    expect(impacts[0].propagationDepth).toBeGreaterThan(0);
    expect(impacts[0].cascadeConfidence).toBeLessThanOrEqual(0.9);
    expect(impacts[0].affectedItemConfidences?.['poi-1']).toBeLessThan(0.9);
  });
});
