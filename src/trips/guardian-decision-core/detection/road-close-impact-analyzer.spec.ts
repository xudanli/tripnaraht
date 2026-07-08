import {
  analyzeRoadCloseImpact,
  assertRoadCloseHasPlanItems,
  buildItemSegmentId,
} from './road-close-impact-analyzer';
import type { RoutePlanDraft } from '../../decision/shared/world-model.types';

describe('road-close-impact-analyzer', () => {
  const tripId = 'trip_iceland_1';
  const itemDrive = 'item_day3_drive';
  const itemCamp = 'item_day3_camp';
  const segDrive = buildItemSegmentId(tripId, itemDrive);
  const segCamp = buildItemSegmentId(tripId, itemCamp);

  const plan: RoutePlanDraft = {
    tripId,
    routeDirectionId: 'synthetic-IS',
    segments: [
      {
        segmentId: segDrive,
        dayIndex: 2,
        distanceKm: 120,
        ascentM: 0,
        slopePct: 0,
        metadata: { itineraryItemId: itemDrive, roadIds: ['F208'] },
      },
      {
        segmentId: segCamp,
        dayIndex: 2,
        distanceKm: 0,
        ascentM: 0,
        slopePct: 0,
        metadata: { itineraryItemId: itemCamp },
      },
    ],
  };

  it('ICE-IMPACT-001: maps F208 closure to drive item + same-day downstream', () => {
    const impact = analyzeRoadCloseImpact(plan, {
      tripId,
      roadId: 'F208',
    });

    expect(impact.matchedSegmentIds).toContain(segDrive);
    expect(impact.affectedPlanItemIds).toContain(itemDrive);
    expect(impact.affectedPlanItemIds).toContain(itemCamp);
    expect(impact.downstreamItemIds).toContain(itemCamp);
    expect(impact.affectedEntityRefs.some((r) => r.kind === 'PLAN_ITEM')).toBe(
      true,
    );
    assertRoadCloseHasPlanItems(impact);
  });

  it('uses primarySegmentId when bindings missing', () => {
    const impact = analyzeRoadCloseImpact(
      {
        ...plan,
        segments: [
          {
            segmentId: segDrive,
            dayIndex: 2,
            distanceKm: 10,
            ascentM: 0,
            slopePct: 0,
            metadata: { itineraryItemId: itemDrive },
          },
        ],
      },
      {
        tripId,
        roadId: 'F208',
        primarySegmentId: segDrive,
      },
    );
    expect(impact.affectedPlanItemIds).toEqual([itemDrive]);
  });

  it('throws when no plan items resolved', () => {
    const impact = analyzeRoadCloseImpact(
      { tripId, routeDirectionId: 'x', segments: [] },
      { tripId, roadId: 'F208' },
    );
    expect(() => assertRoadCloseHasPlanItems(impact)).toThrow(/PlanItem/);
  });
});
