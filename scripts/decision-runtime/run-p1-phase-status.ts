/**
 * Phase 1 status — trigger wiring, provider registry, constraint shadow readiness.
 *
 * Usage:
 *   npm run p1-phase:status
 *   npm run p1-phase:status -- http://localhost:3000/api
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { summarizeTriggerWiring } from '../../src/decision-runtime/trigger/decision-trigger-wiring.catalog';
import { resolveDecisionRuntimeCapabilities } from '../../src/decision-runtime/execution/decision-runtime-capabilities.util';
import { buildDecisionRuntimeCapabilitiesView } from '../../src/decision-runtime/execution/decision-runtime-capabilities.view';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'p1-phase-status');
const BASE = (process.argv[2] ?? process.env.P1_STATUS_BASE_URL ?? 'http://localhost:3000/api').replace(
  /\/$/,
  '',
);

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [p1-status] ${line}`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const localCaps = resolveDecisionRuntimeCapabilities();
  const triggerWiring = summarizeTriggerWiring();
  const view = buildDecisionRuntimeCapabilitiesView();

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
  if (!localCaps.decisionTriggerGateway) {
    blockers.push('DECISION_TRIGGER_GATEWAY_ENABLED=0 — dispatch paths fall back to legacy');
  }
  if (!localCaps.constraintGatewayShadowCompare) {
    blockers.push('CONSTRAINT_GATEWAY_MODE≠SHADOW_COMPARE — constraint divergence not observed');
  }
  if (triggerWiring.notWired > 0) {
    blockers.push(`${triggerWiring.notWired} trigger entry point(s) still not_wired`);
  }
  if (triggerWiring.dispatchCoveragePct < 90) {
    blockers.push(
      `trigger formal coverage ${triggerWiring.dispatchCoveragePct}% < 90% target (includes lineage_only)`,
    );
  }

  const report = {
    schemaId: 'tripnara.p1_phase_status@v1',
    generatedAt: new Date().toISOString(),
    phase: 'P1',
    localCapabilities: localCaps,
    triggerWiring,
    objectiveRegistry: view.objectiveRegistry,
    providerRegistryVersion: view.providerRegistryVersion,
    remoteCapabilitiesProbe: remoteCaps,
    blockers,
    nextSteps: [
      'Enable: DECISION_TRIGGER_GATEWAY_ENABLED=1 CONSTRAINT_GATEWAY_MODE=SHADOW_COMPARE',
      'Run: npm run constraint-shadow:staging',
      'Review constraint shadow divergence rate before ON rollout',
    ],
  };

  const outPath = path.join(OUT_DIR, 'status.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  log(`written ${outPath}`);
  log(
    `trigger wiring: dispatch=${triggerWiring.dispatchWired} lineage=${triggerWiring.lineageOnly} not_wired=${triggerWiring.notWired} coverage=${triggerWiring.dispatchCoveragePct}%`,
  );
  if (blockers.length) {
    log(`P1 blockers (${blockers.length}): ${blockers.join('; ')}`);
    process.exitCode = 1;
  } else {
    log('P1 local gates satisfied (staging validation still recommended)');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
