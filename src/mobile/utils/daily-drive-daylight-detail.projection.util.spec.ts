import {
  formatDaylightDurationZh,
  projectDaylightDetailRich,
} from './daily-drive-daylight-detail.projection.util';
import { DAILY_DRIVE_DIMENSION_SCHEMA_IDS } from '../dto/mobile-daily-drive.types';

describe('daily-drive-daylight-detail.projection.util', () => {
  const ctx = {
    localDate: '2026-02-10',
    timezone: 'Atlantic/Reykjavik',
    tripLabelZh: '冰岛南岸',
    dayLabelZh: '第 4 天',
    contextVersion: 1,
    summaryStatus: 'ATTENTION' as const,
    summaryDetailZh: '日照偏紧',
  };

  it('formats night duration', () => {
    expect(formatDaylightDurationZh(70)).toBe('1 小时 10 分');
    expect(formatDaylightDurationZh(0)).toBe('无明显夜间驾驶');
  });

  it('projects daylight detail aligned to design mock', () => {
    const dto = projectDaylightDetailRich(ctx, {
      sunriseLabel: '09:30',
      sunsetLabel: '17:46',
      dawnLabel: '06:00',
      duskLabel: '18:30',
      sunriseMinutes: 9 * 60 + 30,
      sunsetMinutes: 17 * 60 + 46,
      dawnMinutes: 6 * 60,
      duskMinutes: 18 * 60 + 30,
      nowMinutes: 7 * 60 + 15,
      itineraryItems: [
        { time: '10:00', title: '黑沙滩拍摄', status: 'upcoming' },
        { time: '12:00', title: 'Skaftafell 停留', status: 'upcoming' },
        { time: '18:00', title: '前往冰河湖', status: 'upcoming' },
        {
          time: '21:00',
          title: '酒店入住',
          status: 'upcoming',
          placeCategory: 'HOTEL',
          note: '自助入住',
        },
      ],
    });

    expect(dto.schemaId).toBe(DAILY_DRIVE_DIMENSION_SCHEMA_IDS.DAYLIGHT);
    expect(dto.hero.titleZh).toContain('日照时间有限');
    expect(dto.hero.detailZh).toMatch(/09:30/);
    expect(dto.hero.metaZh).toMatch(/夜间驾驶/);
    expect(dto.sunriseLabelZh).toBe('09:30');
    expect(dto.sunsetLabelZh).toBe('17:46');
    expect(dto.suggestedDepartBeforeZh).toBe('09:00');
    expect(dto.estimatedArrivalZh).toBe('21:00');
    expect(dto.nightDriveMinutes).toBeGreaterThanOrEqual(60);

    const kinds = dto.timelineMarkers.map((m) => m.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        'dawn',
        'suggested_depart',
        'sunrise',
        'now',
        'sunset',
        'arrival',
        'night',
      ]),
    );
    expect(dto.daylightBands.map((b) => b.id)).toEqual([
      'DAWN',
      'DAY',
      'DUSK',
      'NIGHT',
    ]);
    expect(dto.daylightBands.find((b) => b.id === 'DAY')?.labelZh).toBe('白天');

    expect(dto.itineraryLinks[0].daylightStatusZh).toBe('日照充足');
    expect(dto.itineraryLinks[2].daylightStatus).toBe('AFTER_SUNSET');
    expect(dto.itineraryLinks[3].daylightStatus).toBe('NIGHT');

    expect(dto.nightExposure.durationZh).toMatch(/小时/);
    expect(dto.nightExposure.segmentZh).toMatch(/→/);
    expect(dto.nightExposure.severityZh).toBe('注意');

    expect(dto.suggestionsZh.length).toBeGreaterThanOrEqual(2);
    expect(dto.robustPlan.actionZh).toMatch(/前离开/);
    expect(dto.primaryAction?.action).toBe('ADJUST_TODAY');
    expect(dto.primaryAction?.labelZh).toMatch(/前离开/);
  });
});
