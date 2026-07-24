/**
 * P3 phase closure — monitoring detectors, replanning policy, bounded LNS, trigger center.
 *
 * Usage:
 *   REPLANNING_TRIGGER_POLICY_ENABLED=1 BOUNDED_LNS_REPAIR_ENABLED=1 npm run p3-phase:closure
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { summarizeMonitoringDetectorWiring } from '../../src/decision-runtime/trigger/monitoring-detector-wiring.catalog';
import { summarizeTriggerWiring } from '../../src/decision-runtime/trigger/decision-trigger-wiring.catalog';
import { resolveDecisionRuntimeCapabilities } from '../../src/decision-runtime/execution/decision-runtime-capabilities.util';
import { isBoundedLnsRepairEnabled } from '../../src/decision-runtime/local-repair/bounded-lns-repair.config';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'p3-phase-status');

function readJson<T>(p: string): T | null {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [p3-closure] ${line}`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const p2Closure = readJson<{ overall?: string }>(
    path.join(process.cwd(), 'artifacts/p2-phase-status/closure.json'),
  );
  const p3Staging = readJson<{ pass?: boolean; policyProbes?: Array<{ pass: boolean }> }>(
    path.join(process.cwd(), 'artifacts/p3-staging-validation/report.json'),
  );
  const detectorWiring = summarizeMonitoringDetectorWiring();
  const triggerWiring = summarizeTriggerWiring();
  const caps = resolveDecisionRuntimeCapabilities();

  const policyGatedWired = detectorWiring.entries.filter(
    (d) => d.mode === 'policy_gated',
  ).length;

  const items = [
    {
      id: 'p2-closure',
      pass: p2Closure?.overall === 'READY_FOR_P3',
      detail: p2Closure?.overall ?? 'missing',
    },
    {
      id: 'p3-staging-validation',
      pass: p3Staging?.pass === true,
      detail: String(p3Staging?.pass),
    },
    {
      id: 'detector-wiring-coverage',
      pass: detectorWiring.wiredCoveragePct === 100 && detectorWiring.notWired === 0,
      detail: `${detectorWiring.wiredCoveragePct}%`,
    },
    {
      id: 'policy-gated-detectors',
      pass: policyGatedWired >= 3,
      detail: `${policyGatedWired} policy_gated`,
    },
    {
      id: 'trigger-wiring-coverage',
      pass: triggerWiring.notWired === 0 && triggerWiring.dispatchCoveragePct === 100,
      detail: `${triggerWiring.dispatchCoveragePct}%`,
    },
    {
      id: 'replanning-trigger-policy',
      pass: caps.replanningTriggerPolicy === true,
      detail: String(caps.replanningTriggerPolicy),
    },
    {
      id: 'bounded-lns-repair',
      pass: isBoundedLnsRepairEnabled(),
      detail: String(isBoundedLnsRepairEnabled()),
    },
    {
      id: 'trigger-center-api',
      pass: fs.existsSync(
        path.join(process.cwd(), 'src/decision-runtime/trigger/trigger-center.view.ts'),
      ),
      detail: 'trigger-center.view.ts',
    },
  ];

  const failed = items.filter((i) => !i.pass);
  const overall = failed.length === 0 ? 'READY_FOR_P4' : 'IN_PROGRESS';

  const closure = {
    schemaId: 'tripnara.p3_phase_closure@v1',
    generatedAt: new Date().toISOString(),
    overall,
    items,
    detectorWiring: {
      dispatch: detectorWiring.dispatchWired,
      policyGated: detectorWiring.policyGated,
      lineageOnly: detectorWiring.lineageOnly,
    },
    blockers: failed.map((f) => f.id),
    nextPhase:
      overall === 'READY_FOR_P4'
        ? 'Phase 4 — Legacy 收敛'
        : failed.map((f) => f.id),
  };

  const outPath = path.join(OUT_DIR, 'closure.json');
  fs.writeFileSync(outPath, JSON.stringify(closure, null, 2));
  log(`written ${outPath}`);
  log(`overall=${overall} failed=${failed.length}/${items.length}`);

  if (overall !== 'READY_FOR_P4') {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
