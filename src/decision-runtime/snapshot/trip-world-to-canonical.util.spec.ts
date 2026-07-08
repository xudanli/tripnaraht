import { tripWorldStateToCanonicalSnapshot, computeDataCompletenessScore } from './trip-world-to-canonical.util';
import { buildGuideTripWorldState } from '../../guide-to-plan/utils/guide-world-state.util';

describe('tripWorldStateToCanonicalSnapshot', () => {
  it('maps empty physical slices to MISSING completeness', () => {
    const draft = {
      totalDays: 1,
      variant: 'balanced' as const,
      sourceConfidence: 0.8,
      warnings: [],
      days: [{ day: 1, date: '2026-08-01', items: [], activityCount: 0 }],
    };
    const worldState = buildGuideTripWorldState({
      countryCode: 'IS',
      draft,
      sessionId: 's1',
    });
    const snapshot = tripWorldStateToCanonicalSnapshot({
      tripId: 't1',
      snapshotId: 'ws1',
      revision: '1',
      worldState,
    });
    expect(snapshot.schemaId).toBe('tripnara.canonical_world_state_snapshot@v1');
    expect(snapshot.completeness.roads).toBe('MISSING');
    expect(computeDataCompletenessScore(snapshot.completeness)).toBe(0);
  });

  it('materializes poiStates from plan canonical poiIds', () => {
    const snapshot = tripWorldStateToCanonicalSnapshot({
      tripId: 't1',
      snapshotId: 'ws2',
      revision: '1',
      worldState: { signals: {}, context: {} } as never,
      plan: {
        tripId: 't1',
        days: [
          {
            day: 1,
            date: '2026-07-05',
            timeSlots: [
              {
                id: 's1',
                time: '10:00',
                title: '蓝湖',
                type: 'activity',
                poiId: 'is.blue_lagoon',
              },
            ],
          },
        ],
      },
    });
    expect(snapshot.poiStates).toEqual([
      { poiId: 'is.blue_lagoon', sourceRef: 'cpre:iceland-registry@v1' },
    ]);
    expect(snapshot.completeness.poiIdentity).toBe('COMPLETE');
  });
});
