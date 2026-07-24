/**
 * Phase 3 status — monitoring detectors, replanning policy, P2 closure prerequisite.
 *
 * Usage:
 *   npm run p3-phase:status
 *   npm run p3-phase:status -- http://localhost:3000/api
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { summarizeMonitoringDetectorWiring } from '../../src/decision-runtime/trigger/monitoring-detector-wiring.catalog';
import { summarizeTriggerWiring } from '../../src/decision-runtime/trigger/decision-trigger-wiring.catalog';
import { resolveDecisionRuntimeCapabilities } from '../../src/decision-runtime/execution/decision-runtime-capabilities.util';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'p3-phase-status');
const BASE = (process.argv[2] ?? process.env.P3_STATUS_BASE_URL ?? 'http://localhost:3000/api').replace(
  /\/$/,
  '',
);

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [p3-status] ${line}`);
}

function readP2Closure(): { overall?: string } | null {
  const p = path.join(process.cwd(), 'artifacts/p2-phase-status/closure.json');
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const localCaps = resolveDecisionRuntimeCapabilities();
  const triggerWiring = summarizeTriggerWiring();
  const detectorWiring = summarizeMonitoringDetectorWiring();
  const p2Closure = readP2Closure();

  let remoteCaps: unknown = null;
  try {
    const res = await fetch(`${BASE}/decision-engine/v1/runtime-capabilities`, {
      signal: AbortSignal.timeout(5000),
    });
    const json = (await res.json()) as { data?: unknown };
    remoteCaps = json.data ?? null;
  } catch (err) {
    log(`remote capabilities unavailable: ${err instanceof Error ? err.message : String(err)}`);
  }

  const blockers: string[] = [];
  if (p2Closure?.overall !== 'READY_FOR_P3') {
    blockers.push('P2 closure not READY_FOR_P3');
  }
  if (detectorWiring.notWired > 0) {
    blockers.push(`${detectorWiring.notWired} detector(s) not_wired`);
  }
  if (!localCaps.replanningTriggerPolicy) {
    blockers.push('REPLANNING_TRIGGER_POLICY_ENABLED=0 — policy not active locally');
  }

  const report = {
    schemaId: 'tripnara.p3_phase_status@v1',
    generatedAt: new Date().toISOString(),
    phase: 'P3',
    p2ClosureOverall: p2Closure?.overall ?? 'UNKNOWN',
    localCapabilities: localCaps,
    remoteCapabilitiesProbe: remoteCaps,
    triggerWiring,
    detectorWiring,
    blockers,
    nextSteps: [
      'Enable: REPLANNING_TRIGGER_POLICY_ENABLED=1 BOUNDED_LNS_REPAIR_ENABLED=1 DECISION_TRIGGER_GATEWAY_ENABLED=1',
      'Run: npm run p3-staging:validate',
      'Run: npm run p3-phase:closure',
      'Trigger center: GET /decision-engine/v1/trigger-center/by-trip/:tripId',
    ],
  };

  const outPath = path.join(OUT_DIR, 'status.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  log(`written ${outPath}`);
  log(
    `detectors: dispatch=${detectorWiring.dispatchWired} policy_gated=${detectorWiring.policyGated} coverage=${detectorWiring.wiredCoveragePct}%`,
  );

  if (blockers.length) {
    log(`P3 staging blockers (${blockers.length}): ${blockers.join('; ')}`);
    process.exitCode = 1;
  } else {
    log('P3 local gates satisfied (run p3-staging:validate with policy env)');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
