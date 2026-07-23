/**
 * Build SHADOW PredictionRecord from offline weather case
 */

import { createHash } from 'crypto';
import {
  PREDICTION_RECORD_SCHEMA_ID,
  type PredictionRecord,
} from '../contracts';
import { computeInterventionDeadline } from './intervention-deadline.from-temporal';
import type { WeatherOfflineAccuracyCase } from './weather-forecast-series.types';
import {
  predictWeatherTemporalImpact,
  WEATHER_TEMPORAL_PREDICTOR_ID,
  WEATHER_TEMPORAL_PREDICTION_VERSION,
} from './weather-temporal-predictor.shadow';

export const SHADOW_CONTROL_SEALS: PredictionRecord['controlSeals'] = {
  mutatesCanonicalAssessment: false,
  controlsReady: false,
  controlsConfirm: false,
  controlsExecute: false,
  mayCanonicalApply: false,
};

export function buildShadowWeatherPredictionRecord(
  input: WeatherOfflineAccuracyCase,
  nowMs?: number,
): PredictionRecord | null {
  const temporalImpact = predictWeatherTemporalImpact(input, nowMs);
  if (!temporalImpact) return null;

  const interventionDeadline = computeInterventionDeadline({
    temporalImpact,
    nowMs,
  });

  const predictionId = `pred_${createHash('sha256')
    .update(`${input.caseId}|${input.asOf}|${temporalImpact.temporalImpactId}`)
    .digest('hex')
    .slice(0, 20)}`;

  return {
    schemaId: PREDICTION_RECORD_SCHEMA_ID,
    predictionId,
    semanticScope: 'WEATHER_DETERIORATION',
    tripId: input.tripId,
    regionId: input.regionId,
    issuedAt: input.asOf,
    horizonEndAt: input.horizonEndAt,
    predictorId: WEATHER_TEMPORAL_PREDICTOR_ID,
    predictionVersion: WEATHER_TEMPORAL_PREDICTION_VERSION,
    temporalImpact,
    interventionDeadline,
    evidenceRefs: [
      ...temporalImpact.evidenceRefs,
      ...(input.p1ReplayAnchors?.replayFingerprint
        ? [`p1_replay:${input.p1ReplayAnchors.replayFingerprint}`]
        : []),
    ],
    authorityMode: 'SHADOW',
    controlSeals: { ...SHADOW_CONTROL_SEALS },
  };
}
