import {
  isValidInsertionOptionId,
  projectSpatialRoadRisks,
  projectSpatialRouteViewData,
  resolveCandidateMatchPercent,
  resolveSlotTimeFromInsertionOption,
  resolveSpatialRouteSystemImage,
} from './spatial-route.projection.util';

describe('spatial-route.projection.util', () => {
  it('maps category to SF Symbol', () => {
    expect(resolveSpatialRouteSystemImage('waterfall')).toBe('drop');
    expect(resolveSpatialRouteSystemImage('restaurant')).toBe('fork.knife');
    expect(resolveSpatialRouteSystemImage(null)).toBe('mappin.and.ellipse');
  });

  it('resolves match percent from candidate priority', () => {
    expect(resolveCandidateMatchPercent('very_interested')).toBe(88);
    expect(resolveCandidateMatchPercent('unknown')).toBe(70);
  });

  it('builds map with [lng,lat] polylines and required keys when plan has days', () => {
    const data = projectSpatialRouteViewData({
      tripName: '冰岛环岛旅行',
      destinationLabel: 'IS',
      focusDayIndex: 1,
      contextVersion: 12,
      planVersion: 3,
      days: [
        {
          id: 'day-1',
          dayNumber: 1,
          label: '南岸',
          pois: [
            {
              itemId: 'item-1',
              title: '塞里雅兰瀑布',
              category: 'waterfall',
              coords: { lat: 63.6156, lng: -19.9885 },
            },
            {
              itemId: 'item-2',
              title: '斯科加瀑布',
              category: 'waterfall',
              coords: { lat: 63.5321, lng: -19.5112 },
            },
          ],
        },
        {
          id: 'day-2',
          dayNumber: 2,
          label: '东峡湾',
          pois: [],
        },
      ],
      candidates: [
        {
          id: 'cand-1',
          placeId: 101,
          title: '雷尼斯黑沙滩',
          category: 'beach',
          priority: 'very_interested',
          coords: { lat: 63.4045, lng: -19.0484 },
        },
      ],
      risks: [
        {
          id: 'risk-1',
          label: '高地道路封闭',
          roadName: 'F208',
          status: '封闭',
          riskLevel: 'high',
          impactRange: '影响高地区段',
          updatedAt: '2026-07-16T00:00:00Z',
          coords: { lat: 64.0, lng: -19.0 },
        },
      ],
    });

    expect(data.map.polylines).toHaveLength(1);
    expect(data.map.polylines[0].coordinates[0]).toEqual([-19.9885, 63.6156]);
    expect(data.map.polylines[0].style).toBe('confirmed');
    expect(data.map.markers.some((m) => m.type === 'confirmedPOI')).toBe(true);
    expect(data.map.markers.some((m) => m.type === 'candidatePOI')).toBe(true);
    expect(data.map.markers.some((m) => m.type === 'riskPoint')).toBe(true);
    expect(data.map.riskZones).toEqual([]);

    expect(data.dayMarkers).toEqual([
      { id: 'day-1', dayNumber: 1, label: '南岸', isConfirmed: true },
      { id: 'day-2', dayNumber: 2, label: '东峡湾', isConfirmed: false },
    ]);
    expect(data.searchResults).toHaveLength(1);
    expect(data.searchResults[0].id).toBe('cand-1');
    expect(data.candidateDetail.insertionOptions.some((o) => o.isSelected)).toBe(true);
    expect(data.candidateDetail.insertionOptions.filter((o) => o.isSelected)).toHaveLength(1);
    expect(data.routeWarning.roadName).toBe('F208');
    expect(data.pageSubtitle).toContain('Day 1');
    expect(data.contextVersion).toBe(12);
    expect(data.planVersion).toBe(3);
    expect(Object.values(data).every((v) => v !== null)).toBe(true);
  });

  it('keeps map key with empty arrays when no plan geometry', () => {
    const data = projectSpatialRouteViewData({
      tripName: '空行程',
      destinationLabel: '',
      focusDayIndex: 1,
      contextVersion: 1,
      days: [],
      candidates: [],
    });

    expect(data.map).toEqual({ polylines: [], markers: [], riskZones: [] });
    expect(data.dayMarkers).toEqual([]);
    expect(data.routeWarning.label).toBe('');
    expect(data.selectedPOI.title).toBe('');
    expect(data.pageSubtitle).toContain('暂无正式路线几何');
  });

  it('honors focus dayIndex for subtitle and insertion option ids', () => {
    const data = projectSpatialRouteViewData({
      tripName: '测试',
      destinationLabel: 'IS',
      focusDayIndex: 3,
      contextVersion: 1,
      days: [
        { id: 'd1', dayNumber: 1, label: 'A', pois: [] },
        { id: 'd2', dayNumber: 2, label: 'B', pois: [] },
        {
          id: 'd3',
          dayNumber: 3,
          label: 'C',
          pois: [
            {
              itemId: 'i1',
              title: 'POI',
              coords: { lat: 64.1, lng: -21.9 },
            },
          ],
        },
      ],
      candidates: [],
    });

    expect(data.pageSubtitle).toContain('Day 3');
    expect(data.candidateDetail.insertionOptions[0].id).toBe('day-3-best');
  });

  it('validates insertion option ids and projects road-risks', () => {
    expect(isValidInsertionOptionId('day-2-best', 2)).toBe(true);
    expect(isValidInsertionOptionId('day-9-best', 2)).toBe(false);
    expect(resolveSlotTimeFromInsertionOption('day-1-morning')).toBe('10:00');

    const risks = projectSpatialRoadRisks({
      risks: [
        {
          id: 'r1',
          label: '封闭',
          roadName: 'F208',
          status: '封闭',
          riskLevel: 'high',
          impactRange: '高地',
          updatedAt: '2026-07-16T00:00:00Z',
        },
      ],
      contextVersion: 3,
      planVersion: 1,
    });
    expect(risks.items[0].roadName).toBe('F208');
    expect(risks.alertTitle).toBe('封闭');
  });
});
