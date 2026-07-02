/**
 * Scrape runtime + Prometheus and refresh production-metrics.json overlay.
 *
 * Usage:
 *   npm run production-observation:collect
 *   DECISION_RUNTIME_BASE_URL=http://localhost:3000/api npm run production-observation:collect
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import {
  buildMetricsOverlay,
  createLatencyBaseline,
  type LatencyBaseline,
  type LatencyProbeResult,
  type PrometheusMetric,
} from '../../src/decision-runtime/production-transition/production-observation-metrics.collector';

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, 'artifacts', 'production-observation');
const METRICS_PATH = path.join(OUT_DIR, 'production-metrics.json');
const BASELINE_PATH = path.join(OUT_DIR, 'latency-baseline.json');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [production-observation:collect] ${line}`);
}

function resolveApiBase(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

function hostRoot(apiBase: string): string {
  return apiBase.replace(/\/api$/, '');
}

async function probeEndpoint(url: string): Promise<LatencyProbeResult> {
  const start = performance.now();
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    return {
      endpoint: url,
      ok: res.ok,
      durationMs: Number((performance.now() - start).toFixed(2)),
    };
  } catch {
    return {
      endpoint: url,
      ok: false,
      durationMs: Number((performance.now() - start).toFixed(2)),
    };
  }
}

async function fetchPrometheus(host: string): Promise<PrometheusMetric[]> {
  const res = await fetch(`${host}/api/metrics/json`, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`metrics/json HTTP ${res.status}`);
  return (await res.json()) as PrometheusMetric[];
}

import type { ProductionObservationMetricsOverlay } from '../../src/decision-runtime/production-transition/production-observation-supplement.types';

async function fetchRuntime(apiBase: string) {
  const res = await fetch(`${apiBase}/decision-engine/v1/runtime-capabilities`, {
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return undefined;
  const json = (await res.json()) as {
    data?: {
      constraintShadowMetrics?: {
        comparedTotal?: number;
        divergedTotal?: number;
        byDivergenceKind?: Record<string, number>;
      };
      constraintGatewayOnScenarios?: string[];
    };
  };
  return json.data;
}

function readJson<T>(filePath: string): T | undefined {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const apiBase = resolveApiBase(
    process.env.DECISION_RUNTIME_BASE_URL?.trim() || 'http://localhost:3000/api',
  );
  const host = hostRoot(apiBase);

  const probeUrls = [
    `${apiBase}/decision-engine/v1/health`,
    `${apiBase}/decision-engine/v1/runtime-capabilities`,
    `${host}/api/metrics/json`,
  ];

  const probes = await Promise.all(probeUrls.map((url) => probeEndpoint(url)));

  let baseline = readJson<LatencyBaseline>(BASELINE_PATH);
  if (!baseline) {
    baseline = createLatencyBaseline(probes);
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2));
    log(`created latency baseline p95=${baseline.p95Ms}ms → ${BASELINE_PATH}`);
  }

  let prometheus: PrometheusMetric[] = [];
  try {
    prometheus = await fetchPrometheus(host);
  } catch (err) {
    log(`prometheus skip: ${(err as Error).message}`);
  }

  const runtime = await fetchRuntime(apiBase);
  const previousOverlay = readJson<ProductionObservationMetricsOverlay>(METRICS_PATH);
  const fallbackDrill = readJson<{ pass?: boolean }>(
    path.join(ROOT, 'artifacts/p4-legacy-fallback-drill/report.json'),
  );

  const overlay = buildMetricsOverlay({
    probes,
    baseline,
    prometheus,
    constraintShadow: runtime?.constraintShadowMetrics,
    runtimeCaps: {
      constraintGatewayOnScenarios: runtime?.constraintGatewayOnScenarios,
    },
    previousOverlay,
    legacyFallbackDrillPass: fallbackDrill?.pass === true,
    source: `collect:${host}`,
  });

  fs.writeFileSync(METRICS_PATH, JSON.stringify(overlay, null, 2));
  log(`written ${METRICS_PATH}`);
  log(
    `latency p95Growth=${overlay.latency?.p95GrowthPct}% gatewayErrors=${overlay.latency?.gatewayErrorRatePct}%`,
  );
  log(`monitoring eventsProcessed=${overlay.monitoring?.eventsProcessed ?? 0}`);
  if (overlay.volume) {
    log(
      `volume trigger=${overlay.volume.formalTriggerRequests ?? 0} constraint=${overlay.volume.constraintComparisons ?? 0}`,
    );
  }

  const { execSync } = await import('child_process');
  execSync('npm run production-observation:report', { cwd: ROOT, stdio: 'inherit' });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
