import type { CoverageMapData } from '../../readiness/types/coverage-map.types';
import {
  buildRoadClassRepairOptions,
  resolveRoadClassFindingForRepair,
  synthesizeRoadClassIssueFromCoverage,
} from './road-class-repair-options.util';

describe('buildRoadClassRepairOptions', () => {
  it('returns structural Plan B options without adjust_time', () => {
    const response = buildRoadClassRepairOptions('trip-1', {
      id: 'issue-transport-seg-1-long_distance',
      priority: 'suggest_adjust',
      category: 'transport',
      title: '超长距离',
      message: '第1天 · 蓝湖 → 塞济斯菲厄泽 · 超长距离行驶(>300km)',
      affectedDays: [1],
      severity: 'high',
      issueKind: 'road_class',
      fromItemId: 'item-blue-lagoon',
      toItemId: 'item-seyðisfjörður',
      uiHints: { primaryAction: 'open_repair' },
      anchors: {
        segmentId: 'seg-1',
        fromPlaceLabel: '蓝湖温泉',
        toPlaceLabel: '塞济斯菲厄泽',
        distanceKm: 620,
        fromItemId: 'item-blue-lagoon',
        toItemId: 'item-seyðisfjörður',
      },
    });

    expect(response.options.length).toBe(4);
    expect(response.options.some((o) => o.actionType === 'adjust_time')).toBe(false);
    expect(response.options[0].actionType).toBe('change_hotel');
    expect(response.options[0].metadata?.primaryAction).toBe('open_repair');
    expect(response.options[0].payload?.strategy).toBe('midpoint_overnight');
    expect(response.blockerId).toBe('transport-seg-1-long_distance');
  });

  it('synthesizes road_class issue from coverage when findings list is empty', () => {
    const coverage = {
      tripId: 'trip-1',
      bounds: {
        northeast: { lat: 66, lng: -13 },
        southwest: { lat: 63, lng: -24 },
      },
      center: { lat: 64.5, lng: -18 },
      zoom: 6,
      pois: [
        {
          id: 'p1',
          day: 1,
          order: 1,
          name: '蓝湖',
          type: 'attraction',
          itemId: 'item-1',
          coordinates: { lat: 64, lng: -22 },
          coverageStatus: 'covered',
          evidenceCount: 1,
        },
        {
          id: 'p8',
          day: 1,
          order: 2,
          name: '塞济斯菲厄泽',
          type: 'attraction',
          itemId: 'item-8',
          coordinates: { lat: 65.26, lng: -14 },
          coverageStatus: 'covered',
          evidenceCount: 1,
        },
      ],
      segments: [
        {
          id: 'seg-8',
          fromPoiId: 'p1',
          toPoiId: 'p8',
          day: 1,
          distance: 620,
          duration: 480,
          routeType: 'driving',
          coverageStatus: 'warning',
          polyline: '',
          hazards: [
            {
              type: 'long_distance',
              severity: 'high',
              message: '超长距离行驶(>300km)，强烈建议分段或中途住宿',
            },
          ],
        },
      ],
      gaps: [],
      summary: { totalPois: 2, coveredPois: 2, coverageRate: 1, totalGaps: 0, highSeverityGaps: 0 },
      calculatedAt: new Date().toISOString(),
    };

    const finding = resolveRoadClassFindingForRepair(
      'transport-seg-8-long_distance',
      [],
      coverage,
    );
    expect(finding?.issueKind).toBe('road_class');

    const issue = synthesizeRoadClassIssueFromCoverage(
      'issue-transport-seg-8-long_distance',
      coverage,
    );
    const response = buildRoadClassRepairOptions('trip-1', issue!);
    expect(response.options).toHaveLength(4);
    expect(response.options.every((o) => o.actionType !== 'refresh')).toBe(true);
  });
});
