import {
  buildCorridorAdjustPoiPlanningSlice,
  shouldSuppressTripRegionIdForItineraryAdjustPoiPlanning,
} from './itinerary-adjust-poi-planning.util';

describe('itinerary-adjust-poi-planning', () => {
  it('suppresses trip region_id when user only asks to optimize day 2', () => {
    expect(
      shouldSuppressTripRegionIdForItineraryAdjustPoiPlanning(
        '第二天行程安排的不合理，优化一下',
        () => ({ confidence: 0 }),
      ),
    ).toBe(true);
  });

  it('does not suppress when user explicitly mentions golden circle', () => {
    expect(
      shouldSuppressTripRegionIdForItineraryAdjustPoiPlanning('把第二天改成黄金圈一日游', () => ({
        regionIntent: { regionId: 'golden_circle' },
        confidence: 0.92,
      })),
    ).toBe(false);
  });

  it('builds corridor slice without required golden circle anchors', () => {
    const slice = buildCorridorAdjustPoiPlanningSlice();
    expect(slice.poiPlan?.requiredAnchorPoiIds).toEqual([]);
    expect(slice.poiPlan?.excludedPoiIds).toContain('geysir');
    expect(slice.routeIntent?.regionId).toBe('itinerary_adjust_corridor');
  });
});
