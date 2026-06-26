import { ConflictSeverity, ConflictType } from '../../dto/trip-conflicts.dto';
import { assessItineraryCompleteness } from './itinerary-completeness-assessment.util';

describe('itinerary-completeness-assessment.util', () => {
  it('returns perfect score when no structural signals', () => {
    const result = assessItineraryCompleteness({
      tripId: 'trip-1',
      conflicts: [],
    });
    expect(result.score).toBe(100);
    expect(result.signalCount).toBe(0);
    expect(result.issues).toHaveLength(0);
  });

  it('aggregates meal and duplicate conflicts into one rollup issue', () => {
    const result = assessItineraryCompleteness({
      tripId: 'trip-1',
      conflicts: [
        {
          id: 'lunch-1',
          type: ConflictType.LUNCH_MISSING,
          severity: ConflictSeverity.MEDIUM,
          title: '第2天缺少午餐',
          description: 'Day 2 未安排午餐',
          affectedDays: ['2'],
          affectedItemIds: [],
        },
        {
          id: 'dup-1',
          type: ConflictType.DUPLICATE_ITEM,
          severity: ConflictSeverity.HIGH,
          title: '重复 POI',
          description: '蓝湖温泉出现两次',
          affectedDays: ['3'],
          affectedItemIds: ['item-a', 'item-b'],
        },
      ],
    });

    expect(result.signalCount).toBe(2);
    expect(result.score).toBeLessThan(100);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({
      category: 'itinerary_completeness',
      issueKind: 'itinerary_structure',
      priority: 'suggest_adjust',
      affectedDays: [2, 3],
    });
    expect(result.issues[0].proofs?.map((p) => p.ruleId)).toEqual([
      'itinerary_completeness.meal.missing',
      'itinerary_completeness.poi.duplicate',
    ]);
  });

  it('includes blocked segments from coverage map', () => {
    const result = assessItineraryCompleteness({
      tripId: 'trip-1',
      conflicts: [],
      coverage: {
        tripId: 'trip-1',
        bounds: { north: 1, south: 0, east: 1, west: 0 },
        center: { lat: 0, lng: 0 },
        zoom: 8,
        pois: [],
        segments: [
          {
            id: 'seg-1',
            fromPoiId: 'a',
            toPoiId: 'b',
            day: 1,
            distance: 40,
            duration: 60,
            routeType: 'driving',
            coverageStatus: 'blocked',
            polyline: '',
            hazards: [{ type: 'road_closure', severity: 'high', message: 'F208 封闭' }],
          },
        ],
        gaps: [],
        summary: {
          totalPois: 0,
          coveredPois: 0,
          partialPois: 0,
          uncoveredPois: 0,
          totalSegments: 1,
          coveredSegments: 0,
          warningSegments: 0,
          blockedSegments: 1,
          totalGaps: 0,
          coverageRate: 0,
        },
        evidenceStatusSummary: {
          total: 0,
          fetched: 0,
          missing: 0,
          fetching: 0,
          failed: 0,
        },
        calculatedAt: new Date().toISOString(),
      },
    });

    expect(result.signalCount).toBe(1);
    expect(result.issues[0].proofs?.[0]).toMatchObject({
      evidenceType: 'road_closure',
      ruleId: 'itinerary_completeness.segment.blocked',
      currentFact: 'F208 封闭',
    });
  });
});
