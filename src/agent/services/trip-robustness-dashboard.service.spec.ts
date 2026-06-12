import { describe, expect, it } from '@jest/globals';
import { tripDbRowToItinerary, tripDbRowHasSchedulableItems } from '../utils/trip-db-to-itinerary.util';
import {
  mergeRobustnessDashboardCacheIntoMetadata,
  parseRobustnessDashboardCacheFromTripMetadata,
} from '../utils/robustness-dashboard-cache.util';
import { serializeRobustnessDashboard } from '../utils/robustness-rollout-gateway.util';
import type { RobustnessRolloutResult } from '../../trips/execution-simulation/robustness-rollout.types';

describe('trip-db-to-itinerary.util', () => {
  it('converts TripDay rows to itinerary', () => {
    const trip = {
      id: 't1',
      TripDay: [
        {
          date: '2026-07-01',
          ItineraryItem: [
            {
              id: 'item-1',
              type: 'POI',
              startTime: '2026-07-01T09:00:00.000Z',
              endTime: '2026-07-01T11:00:00.000Z',
              Place: { id: 42, nameCN: '蓝湖' },
            },
          ],
        },
      ],
    };
    const itinerary = tripDbRowToItinerary(trip);
    expect(itinerary?.days).toHaveLength(1);
    expect(itinerary?.days?.[0]?.items?.[0]?.location_ref?.name).toBe('蓝湖');
    expect(tripDbRowHasSchedulableItems(trip)).toBe(true);
  });
});

describe('robustness-dashboard-cache.util', () => {
  it('round-trips dashboard cache in trip metadata', () => {
    const result: RobustnessRolloutResult = {
      physicalRobustnessScore: 0.8,
      organizationalRobustnessScore: 0.7,
      bottlenecks: [],
      timeline: [
        {
          timestamp: '2026-07-01T09:00:00.000Z',
          nodeId: 'n1',
          baseUtility: 0.9,
          physicsRobustness: 0.85,
          socialStressIndex: 0.2,
          activePerturbations: [],
        },
      ],
      contingencyPlans: [],
      sampleSummaries: [{ variantId: 'v0' } as RobustnessRolloutResult['sampleSummaries'][0]],
    };
    const dashboard = serializeRobustnessDashboard(result, {
      partyId: 'trip-1',
      memberCount: 2,
      sampleCount: 1,
    });
    const meta = mergeRobustnessDashboardCacheIntoMetadata({}, dashboard);
    const parsed = parseRobustnessDashboardCacheFromTripMetadata(meta.robustnessDashboardV1);
    expect(parsed?.dashboard.physical_robustness_score).toBe(0.8);
    expect(meta.robustnessDashboardRevision).toBe(1);
  });
});
