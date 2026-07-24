import { analyzeWeatherActivityImpact } from './weather-activity-impact-analyzer';
import type { RoutePlanDraft } from '../../decision/shared/world-model.types';

function outdoorPlan(): RoutePlanDraft {
  return {
    tripId: 'trip_wx',
    segments: [
      {
        segmentId: 'seg_outdoor',
        type: 'activity',
        dayIndex: 2,
        metadata: {
          itineraryItemId: 'item_glacier',
          exposure: 'outdoor',
          activityType: 'GLACIER_HIKING',
        },
      },
      {
        segmentId: 'seg_indoor',
        type: 'activity',
        dayIndex: 2,
        metadata: {
          itineraryItemId: 'item_museum',
          exposure: 'indoor',
        },
      },
    ],
  };
}

describe('weather-activity-impact-analyzer', () => {
  it('WX-IMP-001: finds outdoor items on affected day', () => {
    const impact = analyzeWeatherActivityImpact(outdoorPlan(), {
      tripId: 'trip_wx',
      dayIndex: 2,
    });
    expect(impact.affectedPlanItemIds).toEqual(['item_glacier']);
  });

  it('WX-IMP-002: ignores other days', () => {
    const impact = analyzeWeatherActivityImpact(outdoorPlan(), {
      tripId: 'trip_wx',
      dayIndex: 1,
    });
    expect(impact.affectedPlanItemIds).toEqual([]);
  });
});
