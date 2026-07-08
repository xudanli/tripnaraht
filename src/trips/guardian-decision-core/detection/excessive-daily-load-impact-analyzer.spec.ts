import type { RoutePlanDraft } from '../../decision/shared/world-model.types';
import {
  analyzeExcessiveDailyLoadImpact,
  scanPlanForExcessiveDailyLoad,
} from './excessive-daily-load-impact-analyzer';

function planWithDayHours(dayIndex: number, hours: number): RoutePlanDraft {
  const distanceKm = hours * 65;
  return {
    tripId: 'trip_load',
    routeDirectionId: 'synthetic-IS',
    segments: [
      {
        segmentId: `seg_${dayIndex}_1`,
        dayIndex,
        distanceKm,
        ascentM: 0,
        slopePct: 0,
        metadata: { itineraryItemId: `item_d${dayIndex}_1` },
      },
      {
        segmentId: `seg_${dayIndex}_2`,
        dayIndex,
        distanceKm: 0,
        ascentM: 0,
        slopePct: 0,
        metadata: { itineraryItemId: `item_d${dayIndex}_2` },
      },
    ],
  };
}

describe('excessive-daily-load-impact-analyzer', () => {
  it('LOAD-IMP-001: scan detects overloaded day', () => {
    const scan = scanPlanForExcessiveDailyLoad(planWithDayHours(1, 10), 8);
    expect(scan?.dayIndex).toBe(1);
    expect(scan!.drivingHours).toBeGreaterThan(8);
  });

  it('LOAD-IMP-002: analyze collects plan items on day', () => {
    const impact = analyzeExcessiveDailyLoadImpact(planWithDayHours(2, 9), {
      tripId: 'trip_load',
      dayIndex: 2,
      thresholdHours: 8,
    });
    expect(impact.affectedPlanItemIds).toEqual(['item_d2_1', 'item_d2_2']);
  });
});
