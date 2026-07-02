/**
 * Production observation report — six metric categories + dual-gate readiness.
 */

import 'dotenv/config';

function resolveApiBase(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
}

import * as fs from 'fs';
import * as path from 'path';
import { evaluateProductionObservation } from '../../src/decision-runtime/production-transition/production-observation.evaluator';
import type { ProductionObservationRuntimeSnapshot } from '../../src/decision-runtime/production-transition/production-observation.evaluator';
import { loadProductionObservationSupplement } from '../../src/decision-runtime/production-transition/production-observation-supplement.loader';
import { readProductionObservationTimeWindow } from '../../src/decision-runtime/production-transition/production-observation-time-window.util';
import { evaluateProductionObservationReadiness } from '../../src/decision-runtime/production-transition/production-observation-readiness.evaluator';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'production-observation');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [production-observation] ${line}`);
}

async function fetchRuntimeSnapshot(
  baseUrl: string,
): Promise<ProductionObservationRuntimeSnapshot | undefined> {
  const url = `${resolveApiBase(baseUrl)}/decision-engine/v1/runtime-capabilities`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) {
      log(`runtime-capabilities HTTP ${res.status} (${url}) — using catalog-only`);
      return undefined;
    }
    const json = (await res.json()) as {
      success?: boolean;
      data?: ProductionObservationRuntimeSnapshot & {
        constraintGatewayOnScenarios?: string[];
      };
    };
    const body = json.data ?? json;
    if (json.success === false || !body || typeof body !== 'object') {
      log(`runtime-capabilities API unsuccessful (${url}) — using catalog-only`);
      return undefined;
    }
    return {
      triggerWiring: body.triggerWiring,
      constraintShadowMetrics: body.constraintShadowMetrics,
      mode: body.mode,
      constraintGatewayMode: body.constraintGatewayMode,
      effectivePlanWriteGuard: body.effectivePlanWriteGuard,
    };
  } catch (err) {
    log(`runtime-capabilities fetch failed: ${(err as Error).message}`);
    return undefined;
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const tw = readProductionObservationTimeWindow();
  const timeWindow = {
    elapsedDays: tw.elapsedDays,
    requiredDays: tw.requiredDays,
    timePass: tw.timePass,
    selectiveClosureAt: tw.selectiveClosureAt,
    archivedDays: tw.archivedDays,
    observationStartedAt: tw.observationStartedAt,
  };

  const baseUrl = process.env.DECISION_RUNTIME_BASE_URL?.trim();
  const runtime = baseUrl ? await fetchRuntimeSnapshot(baseUrl) : undefined;
  const supplement = loadProductionObservationSupplement();
  if (runtime?.effectivePlanWriteGuard !== undefined) {
    supplement.effectivePlanWriteGuard = runtime.effectivePlanWriteGuard;
  }

  const report = evaluateProductionObservation(timeWindow, runtime, supplement);

  const fallbackDrill = (() => {
    try {
      const j = JSON.parse(
        fs.readFileSync(
          path.join(process.cwd(), 'artifacts/p4-legacy-fallback-drill/report.json'),
          'utf8',
        ),
      ) as { pass?: boolean };
      return j.pass === true;
    } catch {
      return supplement.legacyFallbackDrillPass;
    }
  })();

  const readiness = evaluateProductionObservationReadiness(
    report,
    tw,
    supplement.metricsOverlay?.volume,
    { legacyFallbackDrillPass: fallbackDrill },
  );

  const fullReport = {
    ...report,
    readiness,
    phase: readiness.phase,
  };

  const outPath = path.join(OUT_DIR, 'report.json');
  fs.writeFileSync(outPath, JSON.stringify(fullReport, null, 2));
  log(`written ${outPath}`);
  log(
    `disposition=${report.overallDisposition} ready=${readiness.observationReady} time=${timeWindow.elapsedDays.toFixed(1)}/${timeWindow.requiredDays}d archived=${tw.archivedDays}`,
  );
  log(`blockers=${report.blockers.length} volumeBlockers=${readiness.volumeBlockers.length}`);
  log(`phase=${readiness.phase.decisionRuntimePhase} authority=${readiness.phase.currentAuthority}`);

  if (readiness.nextActions[0]) {
    log(`next: ${readiness.nextActions[0]}`);
  }

  if (process.env.PRODUCTION_OBSERVATION_STRICT === '1' && report.overallDisposition === 'FAIL') {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
