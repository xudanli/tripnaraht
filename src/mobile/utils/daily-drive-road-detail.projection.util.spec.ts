import { projectRoadDetailRich } from './daily-drive-road-detail.projection.util';
import { DAILY_DRIVE_DIMENSION_SCHEMA_IDS } from '../dto/mobile-daily-drive.types';

describe('daily-drive-road-detail.projection.util', () => {
  const ctx = {
    localDate: '2026-07-19',
    timezone: 'Atlantic/Reykjavik',
    tripLabelZh: '冰岛自驾',
    dayLabelZh: '第 3 天',
    contextVersion: 1,
    summaryStatus: 'OK' as const,
    summaryDetailZh: '路况正常',
  };

  it('projects road detail aligned to design mock', () => {
    const dto = projectRoadDetailRich(ctx, {
      routeNodesZh: ['Vik', 'Skaftafell', 'Jökulsárlón'],
      gravelKm: 8,
      crosswind: true,
      nextChangeInMin: 45,
      arrivalWindowZh: '16:20-16:40',
      originLat: 63.42,
      originLng: -19.02,
      items: [
        {
          title: 'Vik',
          time: '09:00',
          status: 'completed',
          lat: 63.42,
          lng: -19.02,
        },
        {
          title: 'Skaftafell',
          time: '11:00',
          status: 'inProgress',
          travelFromPreviousKm: 62,
          lat: 64.02,
          lng: -17.0,
        },
        {
          title: 'Jökulsárlón',
          time: '16:30',
          status: 'upcoming',
          travelFromPreviousKm: 134,
          lat: 64.08,
          lng: -16.23,
        },
      ],
    });

    expect(dto.schemaId).toBe(DAILY_DRIVE_DIMENSION_SCHEMA_IDS.ROAD);
    expect(dto.hero.titleZh).toContain('可通行');
    expect(dto.hero.detailZh).toMatch(/1号公路|碎石/);
    expect(dto.hero.metaZh).toContain('45 分钟');
    expect(dto.routeSummaryZh).toContain('1号公路');
    expect(dto.nextChangeLabelZh).toContain('45');
    expect(dto.routeNodesZh).toEqual(['Vik', 'Skaftafell', 'Jökulsárlón']);
    expect(dto.stats.map((s) => s.id)).toEqual([
      'TOTAL_KM',
      'PROGRESS_KM',
      'ARRIVAL_WINDOW',
    ]);
    expect(dto.stats.find((s) => s.id === 'TOTAL_KM')?.valueZh).toBe('196 km');
    expect(dto.stats.find((s) => s.id === 'PROGRESS_KM')?.valueZh).toMatch(/km/);
    expect(dto.stats.find((s) => s.id === 'ARRIVAL_WINDOW')?.valueZh).toBe('16:20-16:40');
    expect(dto.segments.length).toBeGreaterThanOrEqual(2);
    expect(dto.segments.some((s) => s.statusZh === '横风注意')).toBe(true);
    expect(dto.riskNotesZh.some((n) => n.includes('无封路'))).toBe(true);
    expect(dto.riskNotesZh.some((n) => /碎石/.test(n))).toBe(true);
    expect(dto.parkingSpots.length).toBeGreaterThanOrEqual(1);
    expect(dto.parkingSpots[0].role).toBe('NEXT');
    expect(dto.parkingSpots[0].roleZh).toContain('停车');
    expect(dto.parkingSpots[0].distanceKm).toBeGreaterThan(0);
    expect(dto.changeNoteZh).toMatch(/Runbook/);
    expect(dto.primaryAction?.action).toBe('OPEN_MAP');
  });

  it('prefers Place parking over pack catalog when provided', () => {
    const dto = projectRoadDetailRich(ctx, {
      originLat: 64.05,
      originLng: -16.18,
      placeParking: [
        {
          id: 999001,
          nameEN: 'OSM Lagoon Lot',
          nameCN: '冰河湖 OSM 停车场',
          lat: 64.06,
          lng: -16.2,
          canonicalType: 'PARKING_FREE',
        },
        {
          id: 999002,
          nameEN: 'OSM Fjall Lot',
          nameCN: 'Fjallsárlón OSM 停车场',
          lat: 64.02,
          lng: -16.39,
          canonicalType: 'PARKING',
        },
      ],
      routeNodesZh: ['A', 'B'],
    });
    expect(dto.parkingSpots[0].id).toMatch(/^place:/);
    expect(dto.parkingSpots[0].nameZh).toContain('OSM');
  });
});
