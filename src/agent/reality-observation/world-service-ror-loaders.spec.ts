/**
 * Weather / Road / Daylight ROR loaders 单测。
 */

import {
  estimateDaylightWindowMinutes,
  loadDaylightWindowForRor,
  loadRoadStatusForRor,
  loadWeatherForecastForRor,
  buildWorldServiceRorLoaders,
} from './world-service-ror-loaders';
import { createObservationFetchHost } from './observation-seed.builder';
import { runObservationLoop } from './observation-executor';
import { buildObservationPlan } from './observation-plan.builder';

describe('world-service-ror-loaders', () => {
  it('estimateDaylightWindowMinutes 在冰岛夏季更长', () => {
    const summer = estimateDaylightWindowMinutes('2026-07-01', 64.15);
    const winter = estimateDaylightWindowMinutes('2026-12-21', 64.15);
    expect(summer.daylightMinutes).toBeGreaterThan(winter.daylightMinutes);
    expect(summer.daylightMinutes).toBeGreaterThan(600);
  });

  it('WEATHER / ROAD loaders 经 FetchHost 写入观察事实', async () => {
    const weather = {
      getCurrentWeather: jest.fn().mockResolvedValue({
        temperature_2m: 8,
        wind_speed_10m: 12,
        weather_code: 3,
      }),
    };
    const road = {
      summarizeForOntologyNodeIds: jest.fn().mockResolvedValue(
        new Map([
          [
            'ontology:region:IS:SOUTH_COAST',
            {
              ontologyNodeId: 'ontology:region:IS:SOUTH_COAST',
              aggregateAccessState: 'DIFFICULT',
              segments: [
                {
                  roadQueryKey: '1',
                  accessState: 'DIFFICULT',
                  condition: 'WET',
                },
              ],
            },
          ],
        ]),
      ),
    };

    const w = await loadWeatherForecastForRor(weather, { message: '冰岛南岸天气' }, {
      cityHint: 'Reykjavik',
    });
    expect(w).toEqual(expect.objectContaining({ provider: 'OPEN_METEO', city: 'Reykjavik' }));

    const r = await loadRoadStatusForRor(road, { message: '南岸 F-road 能不能走' });
    expect(r).toEqual(
      expect.objectContaining({
        provider: 'ONTOLOGY_ROAD_STATUS',
        aggregateAccessState: 'DIFFICULT',
      }),
    );

    const daylight = await loadDaylightWindowForRor(
      { message: 'day' },
      '2026-07-15',
      64.15,
    );
    expect((daylight as any).daylightMinutes).toBeGreaterThan(0);

    const loaders = buildWorldServiceRorLoaders({ weather, road, dateYmd: '2026-07-15' });
    const host = createObservationFetchHost({
      seeds: {
        byKey: {
          'trip.id': 't1',
          'targetDay.date': '2026-07-15',
          'targetDay.activities': [{ durationMinutes: 120 }],
          'vehicle.profile': { driveType: '2WD' },
          'vehicle.driveType': '2WD',
          'vehicle.rentalRestriction': { froad: false },
        },
      },
      loaders: loaders as any,
    });

    const plan = buildObservationPlan({
      message: '这条南岸路现在能不能走',
      scope: { tripId: 't1', dayIndex: 1, message: '这条南岸路现在能不能走' },
      travelMode: 'SELF_DRIVE',
    });
    expect(plan?.operation).toBe('ROUTE_EXECUTABILITY');

    const state = await runObservationLoop(plan!, {
      byKey: {
        'trip.id': 't1',
        'vehicle.profile': { driveType: '2WD' },
        'vehicle.driveType': '2WD',
        'vehicle.rentalRestriction': { froad: false },
      },
    }, host);

    expect(state.observedFacts.some((f) => f.key === 'road.segment.status')).toBe(true);
    expect(state.observedFacts.some((f) => f.key === 'weather.forecast')).toBe(true);
  });
});
