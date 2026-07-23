/**
 * ONT-P2-01 — production Replay export (SHADOW predictions + reconciliations)
 */

import { createHash } from 'crypto';
import type { OutcomeReconciliation } from '../contracts';
import type { ShadowPredictionVersionStore } from './prediction-version.store';
import type {
  WeatherShadowPilotTickResult,
  WeatherShadowPilotReport,
} from './weather-shadow-pilot.types';
import { getWeatherShadowSelectedTripIds } from './weather-shadow-selected-trips';
import { isOntologyP2WeatherShadowKillSwitchEngaged } from './weather-shadow.kill-switch';
import type { ShadowControlBoundaryProbe } from './control-boundary.metrics';

export function computeWeatherShadowReplayFingerprint(
  ticks: WeatherShadowPilotTickResult[],
): string {
  const payload = ticks.map((t) => ({
    tripId: t.tripId,
    regionId: t.regionId,
    skipped: t.skipped?.reason ?? null,
    predictionId: t.prediction?.record.predictionId ?? null,
    status: t.prediction?.status ?? null,
    supersededId: t.superseded?.record.predictionId ?? null,
    reconStatus: t.reconciliation?.status ?? null,
    fp: t.reconciliation?.errorMetrics?.falsePositive ?? null,
    fn: t.reconciliation?.errorMetrics?.falseNegative ?? null,
  }));
  return `rp_p2_wx_shadow_${createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex')
    .slice(0, 24)}`;
}

export function buildWeatherShadowPilotReport(input: {
  ticks: WeatherShadowPilotTickResult[];
  probe: ShadowControlBoundaryProbe;
  store: ShadowPredictionVersionStore;
  nowMs?: number;
}): WeatherShadowPilotReport {
  const supersessions = input.ticks.filter((t) => t.superseded).length;
  const reconciliations = input.ticks.filter((t) => t.reconciliation).length;
  const predictionsIssued = input.ticks.filter(
    (t) => t.prediction && !t.skipped,
  ).length;

  return {
    schemaId: 'tripnara.ontology_p2_weather_shadow_pilot@v1',
    workItem: 'ONT-P2-01',
    generatedAt: new Date(input.nowMs ?? Date.now()).toISOString(),
    country: 'IS',
    semanticScope: 'WEATHER_DETERIORATION',
    authorityMode: 'SHADOW',
    selectedTripIds: getWeatherShadowSelectedTripIds(),
    ticks: input.ticks,
    controlBoundaryTotals: input.probe.totals({
      tickCount: input.ticks.length,
      predictionsIssued,
      supersessions,
      reconciliations,
    }),
    replayFingerprint: computeWeatherShadowReplayFingerprint(input.ticks),
    killSwitchEngaged: isOntologyP2WeatherShadowKillSwitchEngaged(),
  };
}

export function exportWeatherShadowProductionReplay(input: {
  report: WeatherShadowPilotReport;
  store: ShadowPredictionVersionStore;
  reconciliations: OutcomeReconciliation[];
}): {
  schemaId: 'tripnara.ontology_p2_weather_shadow_replay@v1';
  workItem: 'ONT-P2-01';
  authorityMode: 'SHADOW';
  replayFingerprint: string;
  predictions: ReturnType<ShadowPredictionVersionStore['dump']>;
  reconciliations: OutcomeReconciliation[];
  controlBoundaryTotals: WeatherShadowPilotReport['controlBoundaryTotals'];
  exportedAt: string;
} {
  return {
    schemaId: 'tripnara.ontology_p2_weather_shadow_replay@v1',
    workItem: 'ONT-P2-01',
    authorityMode: 'SHADOW',
    replayFingerprint: input.report.replayFingerprint,
    predictions: input.store.dump(),
    reconciliations: input.reconciliations,
    controlBoundaryTotals: input.report.controlBoundaryTotals,
    exportedAt: new Date().toISOString(),
  };
}
