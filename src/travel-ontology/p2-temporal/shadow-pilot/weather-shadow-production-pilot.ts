/**
 * ONT-P2-01 — run Weather Production Shadow Pilot over selected fixtures
 */

import { ShadowControlBoundaryProbe } from './control-boundary.metrics';
import { ShadowPredictionVersionStore } from './prediction-version.store';
import {
  buildWeatherShadowPilotReport,
  exportWeatherShadowProductionReplay,
} from './production-replay.export';
import { tickWeatherShadowPilot } from './weather-shadow-pilot.runtime';
import type {
  WeatherShadowPilotReport,
  WeatherShadowWorldView,
} from './weather-shadow-pilot.types';
import type { OutcomeReconciliation } from '../contracts';

/** Production-like selected-trip world views (read-only fixtures) */
export function buildWeatherShadowPilotFixtureViews(): WeatherShadowWorldView[] {
  const baseForecast = [
    {
      at: '2026-07-23T09:00:00.000Z',
      predictedLevel: 'ORANGE' as const,
      forecastIssuedAt: '2026-07-23T06:00:00.000Z',
    },
    {
      at: '2026-07-23T11:00:00.000Z',
      predictedLevel: 'RED' as const,
      forecastIssuedAt: '2026-07-23T06:00:00.000Z',
    },
  ];

  const v1: WeatherShadowWorldView = {
    tripId: 'ont_p2_is_weather_shadow_01',
    country: 'IS',
    contextRevision: 12,
    regionId: 'south_coast',
    subjectId: 'wx_south_coast',
    routeSegmentIds: ['seg_south_coast'],
    vehicleClass: 'HIGH_ROOF_CAMPER',
    asOf: '2026-07-23T06:00:00.000Z',
    horizonEndAt: '2026-07-23T20:00:00.000Z',
    forecastSeries: baseForecast,
    weatherFactSeries: [],
  };

  const v2: WeatherShadowWorldView = {
    ...v1,
    asOf: '2026-07-23T08:00:00.000Z',
    contextRevision: 12, // revision observed unchanged — P2 must not bump it
    forecastSeries: [
      {
        at: '2026-07-23T09:00:00.000Z',
        predictedLevel: 'ORANGE',
        forecastIssuedAt: '2026-07-23T08:00:00.000Z',
      },
      {
        at: '2026-07-23T11:00:00.000Z',
        predictedLevel: 'RED',
        forecastIssuedAt: '2026-07-23T08:00:00.000Z',
      },
    ],
  };

  const v3: WeatherShadowWorldView = {
    ...v2,
    asOf: '2026-07-23T12:00:00.000Z',
    contextRevision: 12,
    weatherFactSeries: [
      { at: '2026-07-23T09:00:00.000Z', level: 'ORANGE', factId: 'fact_wx_1' },
      { at: '2026-07-23T11:00:00.000Z', level: 'RED', factId: 'fact_wx_2' },
    ],
  };

  const windCanary: WeatherShadowWorldView = {
    tripId: 'ont_canary_is_wind_01',
    country: 'IS',
    contextRevision: 4,
    regionId: 'south_coast',
    subjectId: 'wx_south_coast',
    routeSegmentIds: ['seg_south_coast'],
    vehicleClass: 'HIGH_ROOF_CAMPER',
    asOf: '2026-07-23T07:00:00.000Z',
    horizonEndAt: '2026-07-23T18:00:00.000Z',
    forecastSeries: baseForecast,
    weatherFactSeries: [
      { at: '2026-07-23T09:00:00.000Z', level: 'ORANGE' },
    ],
  };

  /** Non-selected trip — must skip */
  const notSelected: WeatherShadowWorldView = {
    tripId: 'ont_canary_is_visa_01',
    country: 'IS',
    contextRevision: 1,
    regionId: 'south_coast',
    subjectId: 'wx_south_coast',
    routeSegmentIds: ['seg_x'],
    asOf: '2026-07-23T07:00:00.000Z',
    horizonEndAt: '2026-07-23T18:00:00.000Z',
    forecastSeries: baseForecast,
    weatherFactSeries: [],
  };

  return [v1, v2, v3, windCanary, notSelected];
}

export async function runWeatherShadowProductionPilot(input?: {
  views?: WeatherShadowWorldView[];
  store?: ShadowPredictionVersionStore;
  probe?: ShadowControlBoundaryProbe;
  nowMs?: number;
}): Promise<{
  report: WeatherShadowPilotReport;
  replay: ReturnType<typeof exportWeatherShadowProductionReplay>;
  store: ShadowPredictionVersionStore;
}> {
  const store = input?.store ?? new ShadowPredictionVersionStore();
  const probe = input?.probe ?? new ShadowControlBoundaryProbe();
  const views = input?.views ?? buildWeatherShadowPilotFixtureViews();
  const ticks = [];
  const reconciliations: OutcomeReconciliation[] = [];

  for (const view of views) {
    const tick = tickWeatherShadowPilot({
      view,
      store,
      probe,
      nowMs: input?.nowMs ?? Date.parse(view.asOf),
    });
    ticks.push(tick);
    if (tick.reconciliation) reconciliations.push(tick.reconciliation);
  }

  const report = buildWeatherShadowPilotReport({
    ticks,
    probe,
    store,
    nowMs: input?.nowMs,
  });
  const replay = exportWeatherShadowProductionReplay({
    report,
    store,
    reconciliations,
  });

  return { report, replay, store };
}
