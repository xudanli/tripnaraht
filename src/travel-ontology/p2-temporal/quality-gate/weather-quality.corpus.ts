/**
 * ONT-P2-02A — quality corpus: offline fixtures + shadow pilot + reversal/unobservable
 */

import { createHash } from 'crypto';
import {
  WEATHER_OFFLINE_ACCURACY_FIXTURES,
  WEATHER_OFFLINE_CASE_FALSE_NEGATIVE,
  WEATHER_OFFLINE_CASE_FALSE_POSITIVE,
  WEATHER_OFFLINE_CASE_PARTIAL_ONSET,
  WEATHER_OFFLINE_CASE_SOUTH_COAST_ALIGNED,
} from '../accuracy/weather-offline-fixtures';
import { buildShadowWeatherPredictionRecord } from '../weather-shadow/build-shadow-prediction-record';
import { reconcileWeatherPrediction } from '../reconciliation/reconcile-prediction.util';
import type { WeatherOfflineAccuracyCase } from '../weather-shadow/weather-forecast-series.types';
import { runWeatherShadowProductionPilot } from '../shadow-pilot/weather-shadow-production-pilot';
import type { QualityCaseBundle } from './weather-quality.types';

function intentForCaseId(
  caseId: string,
): QualityCaseBundle['fixtureIntent'] {
  if (caseId.includes('aligned')) return 'ALIGNED';
  if (caseId.includes('false_positive')) return 'FALSE_POSITIVE';
  if (caseId.includes('false_negative')) return 'FALSE_NEGATIVE';
  if (caseId.includes('partial')) return 'PARTIAL_ONSET';
  if (caseId.includes('reversal')) return 'REVERSAL';
  if (caseId.includes('unobservable')) return 'UNOBSERVABLE';
  return undefined;
}

function bundleFromOfflineCase(
  c: WeatherOfflineAccuracyCase,
  nowMs?: number,
): QualityCaseBundle {
  const prediction = buildShadowWeatherPredictionRecord(c, nowMs);
  const reconciliation = prediction
    ? reconcileWeatherPrediction({ prediction, case: c, nowMs })
    : null;
  return {
    caseId: c.caseId,
    tripId: c.tripId,
    regionId: c.regionId,
    prediction,
    reconciliation,
    fixtureIntent: intentForCaseId(c.caseId),
  };
}

/** Forecast flips RED/ORANGE → YELLOW across versions (reversal) */
export const WEATHER_QUALITY_CASE_REVERSAL: WeatherOfflineAccuracyCase = {
  caseId: 'wx_quality_reversal',
  tripId: 'ont_p2_is_weather_shadow_02',
  regionId: 'south_coast',
  subjectId: 'wx_south_coast',
  affectedScopes: ['seg_south_coast'],
  asOf: '2026-07-23T10:00:00.000Z',
  horizonEndAt: '2026-07-23T20:00:00.000Z',
  forecastSeries: [
    {
      at: '2026-07-23T14:00:00.000Z',
      predictedLevel: 'YELLOW',
      forecastIssuedAt: '2026-07-23T10:00:00.000Z',
    },
  ],
  actualSeries: [
    { at: '2026-07-23T14:00:00.000Z', actualLevel: 'YELLOW' },
  ],
};

export const WEATHER_QUALITY_CASE_REVERSAL_PRIOR: WeatherOfflineAccuracyCase = {
  ...WEATHER_QUALITY_CASE_REVERSAL,
  caseId: 'wx_quality_reversal_prior',
  asOf: '2026-07-23T06:00:00.000Z',
  forecastSeries: [
    {
      at: '2026-07-23T12:00:00.000Z',
      predictedLevel: 'ORANGE',
      forecastIssuedAt: '2026-07-23T06:00:00.000Z',
    },
    {
      at: '2026-07-23T14:00:00.000Z',
      predictedLevel: 'RED',
      forecastIssuedAt: '2026-07-23T06:00:00.000Z',
    },
  ],
  actualSeries: [],
};

/** Predicted hazard but no actual series → unobservable path */
export const WEATHER_QUALITY_CASE_UNOBSERVABLE: WeatherOfflineAccuracyCase = {
  caseId: 'wx_quality_unobservable',
  tripId: 'ont_pilot_is_continuous_mod_01',
  regionId: 'westfjords',
  subjectId: 'wx_west',
  affectedScopes: ['seg_west'],
  asOf: '2026-07-23T05:00:00.000Z',
  horizonEndAt: '2026-07-23T18:00:00.000Z',
  forecastSeries: [
    {
      at: '2026-07-23T12:00:00.000Z',
      predictedLevel: 'ORANGE',
      forecastIssuedAt: '2026-07-23T05:00:00.000Z',
    },
  ],
  actualSeries: [],
};

export async function buildWeatherQualityCorpus(input?: {
  nowMs?: number;
}): Promise<{
  bundles: QualityCaseBundle[];
  corpusFingerprint: string;
}> {
  const nowMs = input?.nowMs ?? Date.parse('2026-07-23T18:00:00.000Z');
  const bundles: QualityCaseBundle[] = [];

  for (const c of WEATHER_OFFLINE_ACCURACY_FIXTURES) {
    bundles.push(bundleFromOfflineCase(c, nowMs));
  }

  // Reversal pair
  const prior = buildShadowWeatherPredictionRecord(
    WEATHER_QUALITY_CASE_REVERSAL_PRIOR,
    nowMs,
  );
  const current = buildShadowWeatherPredictionRecord(
    WEATHER_QUALITY_CASE_REVERSAL,
    nowMs,
  );
  const recon = current
    ? reconcileWeatherPrediction({
        prediction: current,
        case: WEATHER_QUALITY_CASE_REVERSAL,
        nowMs,
      })
    : null;
  bundles.push({
    caseId: WEATHER_QUALITY_CASE_REVERSAL.caseId,
    tripId: WEATHER_QUALITY_CASE_REVERSAL.tripId,
    regionId: WEATHER_QUALITY_CASE_REVERSAL.regionId,
    prediction: current,
    priorPrediction: prior,
    reconciliation: recon,
    fixtureIntent: 'REVERSAL',
  });

  bundles.push(
    bundleFromOfflineCase(
      {
        ...WEATHER_QUALITY_CASE_UNOBSERVABLE,
        // Force empty actual → reconciler may UNOBSERVABLE when predictedAffect
        actualSeries: [],
      },
      nowMs,
    ),
  );

  // Shadow pilot ticks with reconciliations
  const pilot = await runWeatherShadowProductionPilot({ nowMs });
  for (const tick of pilot.report.ticks) {
    if (tick.skipped || !tick.prediction) continue;
    bundles.push({
      caseId: `shadow_pilot_${tick.tripId}_${tick.prediction.record.issuedAt}`,
      tripId: tick.tripId,
      regionId: tick.regionId,
      prediction: tick.prediction.record,
      priorPrediction: tick.superseded?.record ?? null,
      reconciliation: tick.reconciliation ?? null,
      fixtureIntent: 'SHADOW_PILOT',
    });
  }

  void WEATHER_OFFLINE_CASE_SOUTH_COAST_ALIGNED;
  void WEATHER_OFFLINE_CASE_FALSE_POSITIVE;
  void WEATHER_OFFLINE_CASE_FALSE_NEGATIVE;
  void WEATHER_OFFLINE_CASE_PARTIAL_ONSET;

  const corpusFingerprint = `corp_${createHash('sha256')
    .update(
      JSON.stringify(
        bundles.map((b) => ({
          id: b.caseId,
          pred: b.prediction?.predictionId ?? null,
          status: b.reconciliation?.status ?? null,
          rev: Boolean(b.priorPrediction),
        })),
      ),
    )
    .digest('hex')
    .slice(0, 24)}`;

  return { bundles, corpusFingerprint };
}
