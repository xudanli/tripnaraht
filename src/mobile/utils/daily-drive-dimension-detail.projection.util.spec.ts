import {
  fuelLevelToFraction,
  isDailyDriveDimensionCode,
  mapStatusToDetailSeverity,
  projectDaylightDetail,
  projectFuelDetail,
  projectRoadDetail,
  projectScheduleDetail,
  projectWeatherDetail,
} from './daily-drive-dimension-detail.projection.util';
import { DAILY_DRIVE_DIMENSION_SCHEMA_IDS } from '../dto/mobile-daily-drive.types';

const baseCtx = {
  localDate: '2026-07-19',
  timezone: 'Atlantic/Reykjavik',
  tripLabelZh: '冰岛环岛',
  dayLabelZh: '第 3 天',
  contextVersion: 42,
  summaryStatus: 'OK' as const,
  summaryDetailZh: '摘要',
};

describe('daily-drive-dimension-detail.projection.util', () => {
  it('maps status to detail severity', () => {
    expect(mapStatusToDetailSeverity('OK')).toBe('OK');
    expect(mapStatusToDetailSeverity('ATTENTION')).toBe('ATTENTION');
    expect(mapStatusToDetailSeverity('BLOCKED')).toBe('BLOCKED');
  });

  it('validates dimension codes', () => {
    expect(isDailyDriveDimensionCode('ROAD')).toBe(true);
    expect(isDailyDriveDimensionCode('FOO')).toBe(false);
  });

  it('projects ROAD detail with schema and primaryAction', () => {
    const dto = projectRoadDetail(baseCtx, {
      alertTitle: '路况正常',
      alertDetail: '计划路段开放 · 含碎石路',
      timeline: [{ time: '08:00', event: '环岛路畅通', severity: 'low' }],
      routeNodesZh: ['Vik', 'Skaftafell', 'Jökulsárlón'],
      gravelKm: 8,
      items: [
        { title: 'Vik', time: '09:00', status: 'completed', travelFromPreviousKm: 0 },
        { title: 'Skaftafell', time: '11:00', status: 'inProgress', travelFromPreviousKm: 62 },
        { title: 'Jökulsárlón', time: '16:30', status: 'upcoming', travelFromPreviousKm: 134 },
      ],
    });
    expect(dto.schemaId).toBe(DAILY_DRIVE_DIMENSION_SCHEMA_IDS.ROAD);
    expect(dto.hero.titleZh).toContain('可通行');
    expect(dto.primaryAction?.action).toBe('OPEN_MAP');
    expect(dto.segments.length).toBeGreaterThan(0);
    expect(dto.routeNodesZh.length).toBeGreaterThanOrEqual(3);
    expect(dto.stats.map((s) => s.id)).toEqual([
      'TOTAL_KM',
      'PROGRESS_KM',
      'ARRIVAL_WINDOW',
    ]);
    expect(dto.changeNoteZh).toMatch(/Runbook/);
  });

  it('projects WEATHER with CAUTION on strong wind', () => {
    const dto = projectWeatherDetail(
      { ...baseCtx, summaryStatus: 'OK' },
      { windMsMin: 8, windMsMax: 14, icy: false },
    );
    expect(dto.schemaId).toBe(DAILY_DRIVE_DIMENSION_SCHEMA_IDS.WEATHER);
    expect(dto.hero.severity).toBe('CAUTION');
    expect(dto.metrics.some((m) => m.id === 'WIND')).toBe(true);
    expect(dto.metrics).toHaveLength(4);
    expect(dto.impacts.map((i) => i.id)).toEqual([
      'CROSSWIND',
      'ICING',
      'VISIBILITY',
    ]);
  });

  it('projects DAYLIGHT sunrise/sunset and nightExposure', () => {
    const dto = projectDaylightDetail(
      { ...baseCtx, summaryStatus: 'ATTENTION', summaryDetailZh: '日照偏紧' },
      {
        sunriseLabel: '09:30',
        sunsetLabel: '17:46',
        dawnLabel: '06:00',
        nightDriveLabelZh: '夜间驾驶约 1 小时 10 分钟',
        attention: true,
        itineraryItems: [
          { time: '10:00', title: '黑沙滩' },
          { time: '18:20', title: '冰河湖' },
          { time: '21:00', title: '酒店', placeCategory: 'HOTEL' },
        ],
      },
    );
    expect(dto.schemaId).toBe(DAILY_DRIVE_DIMENSION_SCHEMA_IDS.DAYLIGHT);
    expect(dto.sunriseLabelZh).toBe('09:30');
    expect(dto.sunsetLabelZh).toBe('17:46');
    expect(dto.nightExposure.severity).toBe('ATTENTION');
    expect(dto.itineraryLinks.length).toBeGreaterThanOrEqual(2);
    expect(dto.daylightBands).toHaveLength(4);
    expect(dto.timelineMarkers.some((m) => m.kind === 'suggested_depart')).toBe(
      true,
    );
    expect(dto.primaryAction?.action).toBe('ADJUST_TODAY');
  });

  it('projects FUEL detail aligned to design (coverage + stations)', () => {
    expect(fuelLevelToFraction('THREE_QUARTERS')).toBe(0.75);
    const dto = projectFuelDetail(baseCtx, {
      fuelLevel: 'THREE_QUARTERS',
      nextStationKm: 42,
      stations: [
        {
          id: 'place:1',
          nameZh: 'N1 Hvolsvöllur',
          tag: 'RECOMMENDED',
          tagZh: '推荐',
          distanceKm: 42,
          durationZh: '45 分钟',
          detailZh: '42 km · 45 分钟',
          lat: 63.75,
          lng: -20.22,
        },
        {
          id: 'place:2',
          nameZh: 'Olís Kirkjubæjarklaustur',
          tag: 'RELIABLE',
          tagZh: '可靠',
          distanceKm: 121,
          durationZh: '1 小时 30 分钟',
          lat: 63.78,
          lng: -18.05,
        },
        {
          id: 'place:3',
          nameZh: 'Orkan Höfn',
          tag: 'ALTERNATE',
          tagZh: '备选',
          distanceKm: 218,
          durationZh: '2 小时 45 分钟',
          lat: 64.25,
          lng: -15.21,
        },
      ],
    });
    expect(dto.schemaId).toBe(DAILY_DRIVE_DIMENSION_SCHEMA_IDS.FUEL);
    expect(dto.fuelFraction).toBe(0.75);
    expect(dto.rangeKm).toBe(420);
    expect(dto.selectedFuelLevel).toBe('THREE_QUARTERS');
    expect(dto.hero.titleZh).toContain('可继续');
    expect(dto.primaryAction?.action).toBe('UPDATE_FUEL_LEVEL');
    expect(dto.coverage.map((c) => c.id)).toEqual([
      'TODAY_REMAINING',
      'TOMORROW_MORNING',
      'REMOTE_REDUNDANCY',
    ]);
    expect(dto.stations).toHaveLength(3);
    expect(dto.stations[0].nameZh).toContain('N1');
    expect(dto.stations[0].tag).toBe('RECOMMENDED');
    expect(dto.stations[0].id).toMatch(/^place:/);
    expect(dto.ifNoRefuelZh).toBeTruthy();
    expect(dto.suggestionZh).toContain('Hvolsvöllur');
  });

  it('projects SCHEDULE timeline statuses', () => {
    const dto = projectScheduleDetail(
      { ...baseCtx, summaryStatus: 'ATTENTION' },
      {
        items: [
          { time: '09:00', title: '出发', status: 'completed' },
          { time: '10:00', title: '冰川徒步集合', status: 'inProgress' },
          { time: '16:00', title: '入住', status: 'upcoming', placeCategory: 'HOTEL' },
        ],
        nextHardWindowZh: '下一个硬时间窗：冰川徒步 10:00',
        checkInZh: '住宿入住：16:00',
        naraSuggestionZh: '保留缓冲',
        delayMin: 10,
        delayMax: 20,
      },
    );
    expect(dto.schemaId).toBe(DAILY_DRIVE_DIMENSION_SCHEMA_IDS.SCHEDULE);
    expect(dto.timeline.map((t) => t.status)).toEqual([
      'done',
      'hard_window',
      'upcoming',
    ]);
    expect(dto.naraSuggestionZh).toBe('保留缓冲');
    expect(dto.primaryAction?.action).toBe('ADJUST_TODAY');
    expect(dto.buffers).toHaveLength(3);
    expect(dto.impacts).toHaveLength(3);
    expect(dto.keyNodes).toHaveLength(3);
  });
});
