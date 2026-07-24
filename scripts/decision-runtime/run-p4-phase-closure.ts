/**
 * P4 phase closure — CANONICAL_SELECTIVE milestone.
 *
 * Usage:
 *   LEGACY_CONVERGENCE_TARGET=CANONICAL_SELECTIVE \
 *   REPLANNING_TRIGGER_POLICY_ENABLED=1 BOUNDED_LNS_REPAIR_ENABLED=1 \
 *   DECISION_TRIGGER_GATEWAY_ENABLED=1 CONSTRAINT_GATEWAY_MODE=ON_FOR_SELECTED \
 *   npm run p4-phase:closure
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { resolveDecisionRuntimeCapabilities } from '../../src/decision-runtime/execution/decision-runtime-capabilities.util';
import { evaluateLegacyConvergence } from '../../src/decision-runtime/p4-phase/legacy-convergence.evaluator';
import { snapshotConstraintOnRolloutCatalog } from '../../src/decision-runtime/p2-phase/constraint-on-rollout.catalog';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'p4-phase-status');

function readJson<T>(p: string): T | null {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [p4-closure] ${line}`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const p3Closure = readJson<{ overall?: string }>(
    path.join(process.cwd(), 'artifacts/p3-phase-status/closure.json'),
  );
  const p4Staging = readJson<{ pass?: boolean }>(
    path.join(process.cwd(), 'artifacts/p4-staging-validation/report.json'),
  );
  const p4Selective = readJson<{ pass?: boolean }>(
    path.join(process.cwd(), 'artifacts/p4-selective-staging/report.json'),
  );
  const caps = resolveDecisionRuntimeCapabilities();
  const convergence = evaluateLegacyConvergence(caps);
  const rollout = snapshotConstraintOnRolloutCatalog();

  const items = [
    {
      id: 'p3-closure',
      pass: p3Closure?.overall === 'READY_FOR_P4',
      detail: p3Closure?.overall ?? 'missing',
    },
    {
      id: 'p4-staging-validation',
      pass: p4Staging?.pass === true,
      detail: String(p4Staging?.pass),
    },
    {
      id: 'p4-selective-http-staging',
      pass: p4Selective?.pass === true,
      detail: String(p4Selective?.pass),
    },
    {
      id: 'canonical-selective-stage',
      pass:
        convergence.currentStage === 'CANONICAL_SELECTIVE' ||
        (convergence.targetStage === 'CANONICAL_SELECTIVE' && convergence.canPromote),
      detail: `${convergence.currentStage}→${convergence.targetStage}`,
    },
    {
      id: 'constraint-on-selected',
      pass: rollout.onForSelectedCount >= 7,
      detail: `${rollout.onForSelectedCount}/7`,
    },
    {
      id: 'legacy-authority-unchanged',
      pass: caps.optimizationStrategyMode !== 'CPSAT_LEX',
      detail: caps.optimizationStrategyMode,
    },
    {
      id: 'canary-gates',
      pass: convergence.signals.canaryReady,
      detail: String(convergence.signals.canaryReady),
    },
  ];

  const failed = items.filter((i) => !i.pass);
  const overall =
    failed.length === 0 ? 'CANONICAL_SELECTIVE_READY' : 'IN_PROGRESS';

  const closure = {
    schemaId: 'tripnara.p4_phase_closure@v1',
    generatedAt: new Date().toISOString(),
    overall,
    currentStage: convergence.currentStage,
    targetStage: convergence.targetStage,
    items,
    blockers: failed.map((f) => f.id),
    nextMilestone: 'CANONICAL_DEFAULT (7/7 ON; need DECISION_RUNTIME_MODE=CANONICAL + CONSTRAINT_GATEWAY_MODE=ON + 30d observation)',
  };

  const outPath = path.join(OUT_DIR, 'closure.json');
  fs.writeFileSync(outPath, JSON.stringify(closure, null, 2));
  log(`written ${outPath}`);
  log(`overall=${overall} failed=${failed.length}/${items.length}`);

  if (overall !== 'CANONICAL_SELECTIVE_READY') {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
