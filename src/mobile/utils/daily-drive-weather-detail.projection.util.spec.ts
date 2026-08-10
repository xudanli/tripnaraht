import {
  parseWeatherSignals,
  projectWeatherDetailRich,
} from './daily-drive-weather-detail.projection.util';
import { DAILY_DRIVE_DIMENSION_SCHEMA_IDS } from '../dto/mobile-daily-drive.types';

describe('daily-drive-weather-detail.projection.util', () => {
  const ctx = {
    localDate: '2026-07-19',
    timezone: 'Atlantic/Reykjavik',
    tripLabelZh: '冰岛南岸',
    dayLabelZh: '第 4 天',
    contextVersion: 1,
    summaryStatus: 'OK' as const,
    summaryDetailZh: '天气正常',
  };

  it('parses wind and ice from event text', () => {
    const s = parseWeatherSignals('侧风 6-10 m/s，路面湿滑，气温 -2℃');
    expect(s.windMsMin).toBe(6);
    expect(s.windMsMax).toBe(10);
    expect(s.tempC).toBe(-2);
    expect(s.icy).toBe(true);
    expect(s.crosswind).toBe(true);
  });

  it('projects weather detail aligned to design mock', () => {
    const dto = projectWeatherDetailRich(ctx, {
      tempC: -2,
      windMsMin: 6,
      windMsMax: 10,
      icy: true,
      envEvents: [
        {
          description: '近海阵风增强，局部侧风',
          severity: 'yellow',
          detectedAt: '2026-07-19T09:00:00.000Z',
        },
      ],
    });

    expect(dto.schemaId).toBe(DAILY_DRIVE_DIMENSION_SCHEMA_IDS.WEATHER);
    expect(dto.hero.titleZh).toMatch(/可继续/);
    expect(dto.hero.detailZh).toMatch(/-2℃/);
    expect(dto.hero.metaZh).toMatch(/主要影响/);
    expect(dto.summaryLineZh).toMatch(/阵风/);
    expect(dto.metrics.map((m) => m.id)).toEqual([
      'TEMP',
      'WIND',
      'VISIBILITY',
      'SNOWFALL',
    ]);
    expect(dto.metrics.find((m) => m.id === 'WIND')?.valueZh).toBe('6-10 m/s');
    expect(dto.metrics.find((m) => m.id === 'SNOWFALL')?.valueZh).toContain('无明显');
    expect(dto.trends.length).toBeGreaterThanOrEqual(3);
    expect(dto.impacts.map((i) => i.id)).toEqual([
      'CROSSWIND',
      'ICING',
      'VISIBILITY',
    ]);
    expect(dto.impacts.find((i) => i.id === 'ICING')?.statusZh).toBe('注意');
    expect(dto.suggestionsZh.some((s) => /停车前请重新查看天气/.test(s))).toBe(
      true,
    );
    expect(dto.reminderSettings.map((r) => r.id)).toEqual([
      'wind',
      'snowfall',
      'visibility',
    ]);
    expect(dto.primaryAction?.action).toBe('ENABLE_WEATHER_REMINDERS');
  });
});
