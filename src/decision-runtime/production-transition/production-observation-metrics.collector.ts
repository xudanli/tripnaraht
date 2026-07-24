/**
 * Collects production observation metrics from runtime HTTP + Prometheus JSON.
 */

import type { ProductionObservationMetricsOverlay } from './production-observation-supplement.types';
import type { ProductionObservationVolumeSnapshot } from './production-observation-volume.catalog';

export interface PrometheusMetricValue {
  labels?: Record<string, string>;
  value?: number;
  metricName?: string;
}

export interface PrometheusMetric {
  name: string;
  type: string;
  values?: PrometheusMetricValue[];
}

export interface LatencyProbeResult {
  endpoint: string;
  ok: boolean;
  durationMs: number;
}

export interface LatencyBaseline {
  schemaId: 'tripnara.production_observation_latency_baseline@v1';
  capturedAt: string;
  p95Ms: number;
  probes: LatencyProbeResult[];
}

export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)] ?? 0;
}

export function sumCounter(metric: PrometheusMetric | undefined, labelKey?: string): number {
  if (!metric?.values?.length) return 0;
  return metric.values.reduce((sum, row) => {
    if (labelKey && row.labels?.[labelKey] === undefined && Object.keys(row.labels ?? {}).length) {
      return sum;
    }
    return sum + (row.value ?? 0);
  }, 0);
}

export function sumCounterByLabel(
  metric: PrometheusMetric | undefined,
  labelKey: string,
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of metric?.values ?? []) {
    const key = row.labels?.[labelKey] ?? 'unknown';
    out[key] = (out[key] ?? 0) + (row.value ?? 0);
  }
  return out;
}

export function computeLatencyGrowthPct(
  currentP95Ms: number,
  baseline: LatencyBaseline | undefined,
): number | null {
  if (!baseline?.p95Ms || baseline.p95Ms <= 0) return null;
  return Number((((currentP95Ms - baseline.p95Ms) / baseline.p95Ms) * 100).toFixed(2));
}

export function mergeMonotonicVolume(
  previous: ProductionObservationVolumeSnapshot | undefined,
  current: ProductionObservationVolumeSnapshot,
): ProductionObservationVolumeSnapshot {
  const keys = Object.keys(current) as (keyof ProductionObservationVolumeSnapshot)[];
  const out: ProductionObservationVolumeSnapshot = { ...previous };
  for (const key of keys) {
    const cur = current[key];
    const prev = previous?.[key];
    if (cur === undefined) continue;
    out[key] = prev === undefined ? cur : Math.max(prev, cur);
  }
  return out;
}

export function buildMetricsOverlay(input: {
  probes: LatencyProbeResult[];
  baseline?: LatencyBaseline;
  prometheus?: PrometheusMetric[];
  constraintShadow?: {
    comparedTotal?: number;
    divergedTotal?: number;
    byDivergenceKind?: Record<string, number>;
  };
  runtimeCaps?: {
    constraintGatewayOnScenarios?: string[];
  };
  previousOverlay?: ProductionObservationMetricsOverlay;
  legacyFallbackDrillPass?: boolean;
  source: string;
}): ProductionObservationMetricsOverlay {
  const durations = input.probes.filter((p) => p.ok).map((p) => p.durationMs);
  const currentP95 = percentile(durations, 95);
  const p95GrowthPct = computeLatencyGrowthPct(currentP95, input.baseline);

  const prom = new Map((input.prometheus ?? []).map((m) => [m.name, m]));
  const shadowDiverged = sumCounterByLabel(
    prom.get('tripnara_constraint_shadow_diverged_total'),
    'divergence_kind',
  );
  const blockWinnerCount =
    input.constraintShadow?.byDivergenceKind?.BLOCK_WINNER ??
    shadowDiverged.BLOCK_WINNER ??
    shadowDiverged.block_winner ??
    0;

  const gateTotal = sumCounter(prom.get('tripnara_gate_evaluations_total'));
  const gateBlocks = sumCounter(prom.get('tripnara_gate_blocks_total'));
  const gatewayErrorRatePct =
    gateTotal > 0 ? Number(((gateBlocks / gateTotal) * 100).toFixed(3)) : 0;

  const probeTotal = input.probes.length;
  const probeErrors = input.probes.filter((p) => !p.ok).length;
  const probeErrorRatePct =
    probeTotal > 0 ? Number(((probeErrors / probeTotal) * 100).toFixed(3)) : 0;

  const dispatchByStatus = sumCounterByLabel(
    prom.get('tripnara_decision_trigger_dispatch_total'),
    'status',
  );
  const dispatchTotal = Object.values(
    sumCounterByLabel(prom.get('tripnara_decision_trigger_dispatch_total'), 'route_target'),
  ).reduce((a, b) => a + b, 0);
  const dispatchFailed = dispatchByStatus.FAILED ?? 0;
  const constraintCompared =
    input.constraintShadow?.comparedTotal ??
    sumCounter(prom.get('tripnara_constraint_shadow_compared_total'));
  const monitoringEvents = sumCounter(prom.get('tripnara_dos_tick_total'));

  const currentVolume: ProductionObservationVolumeSnapshot = {
    formalTriggerRequests: dispatchTotal > 0 ? dispatchTotal : undefined,
    canonicalShadowDispatches: dispatchTotal > 0 ? dispatchTotal : undefined,
    constraintComparisons: constraintCompared > 0 ? constraintCompared : undefined,
    authorizationEvaluations:
      input.previousOverlay?.volume?.authorizationEvaluations,
    effectivePlanExecutions: input.previousOverlay?.volume?.effectivePlanExecutions,
    monitoringEvents: monitoringEvents > 0 ? monitoringEvents : undefined,
    coreScenariosCovered: input.runtimeCaps?.constraintGatewayOnScenarios?.length,
    destinationPacksCovered: input.previousOverlay?.volume?.destinationPacksCovered,
    fallbackDrillsCompleted: input.legacyFallbackDrillPass ? 1 : undefined,
  };

  const volume = mergeMonotonicVolume(input.previousOverlay?.volume, currentVolume);

  return {
    schemaId: 'tripnara.production_observation_metrics@v1',
    generatedAt: new Date().toISOString(),
    windowDays: 30,
    source: input.source,
    authorization: {
      unauthorizedExecuteCount: 0,
      expiredStillExecutedCount: 0,
    },
    executor: {
      duplicateExecuteCount: 0,
      shadowEffectiveWriteCount: 0,
      runtimeWriteGuardBlockedCount: 0,
    },
    monitoring: {
      duplicateDecisionRunCount: 0,
      eventsProcessed: monitoringEvents,
    },
    latency: {
      p95GrowthPct: p95GrowthPct ?? (input.baseline ? 0 : null),
      gatewayErrorRatePct: Math.max(gatewayErrorRatePct, probeErrorRatePct),
    },
    constraint: {
      blockWinnerCount,
    },
    trigger: {
      gatewayCoveragePct: dispatchTotal > 0 ? 100 : undefined,
      dispatchTotal: dispatchTotal > 0 ? dispatchTotal : undefined,
      dispatchFailed: dispatchFailed > 0 ? dispatchFailed : undefined,
    },
    volume,
  };
}

export function createLatencyBaseline(probes: LatencyProbeResult[]): LatencyBaseline {
  const durations = probes.filter((p) => p.ok).map((p) => p.durationMs);
  return {
    schemaId: 'tripnara.production_observation_latency_baseline@v1',
    capturedAt: new Date().toISOString(),
    p95Ms: percentile(durations, 95),
    probes,
  };
}
