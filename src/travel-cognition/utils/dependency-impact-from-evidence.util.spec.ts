import { buildDependencyImpactFromEvidence } from './dependency-impact-from-evidence.util';

describe('dependency-impact-from-evidence', () => {
  it('builds impact from violated drive_safety hard fact and itinerary', () => {
    const result = buildDependencyImpactFromEvidence({
      tripId: 'trip-1',
      hardFacts: [{ rule_id: 'drive_safety_v1', is_violated: true }],
      itineraryItems: [
        {
          id: 'a1',
          type: 'ACTIVITY',
          startTime: '2026-07-01T12:00:00.000Z',
          dayDate: '2026-07-01',
          placeName: 'Seljalandsfoss',
          metadata: { indoorOutdoor: 'outdoor' },
        },
      ],
    });

    expect(result).not.toBeNull();
    expect(result!.impact.rootFactType).toBe('WEATHER');
    expect(result!.impact.affected.length).toBeGreaterThan(0);
  });

  it('builds impact from prefetched road closure evidence', () => {
    const result = buildDependencyImpactFromEvidence({
      prefetchedEvidence: [
        {
          kind: 'road_status',
          isOpen: false,
          riskLevel: 3,
          reason: 'F-road F208 closed',
          metadata: { isFroad: true },
          at: '2026-07-01T08:00:00.000Z',
          source: 'road.is',
        },
      ],
      itineraryItems: [
        {
          id: 'd1',
          type: 'DRIVE',
          startTime: '2026-07-01T09:00:00.000Z',
          metadata: { isFroad: true },
          dayDate: '2026-07-01',
        },
      ],
    });

    expect(result).not.toBeNull();
    expect(result!.impact.rootFactType).toBe('ROAD');
  });

  it('returns null when no actionable evidence', () => {
    expect(
      buildDependencyImpactFromEvidence({
        prefetchedEvidence: [{ kind: 'road_status', isOpen: true, riskLevel: 0 }],
      }),
    ).toBeNull();
  });
});
