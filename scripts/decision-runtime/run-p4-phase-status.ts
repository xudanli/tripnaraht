/**
 * Phase 4 status — legacy convergence ladder + P3 prerequisite.
 *
 * Usage:
 *   npm run p4-phase:status
 *   LEGACY_CONVERGENCE_TARGET=CANONICAL_SELECTIVE npm run p4-phase:status
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { resolveDecisionRuntimeCapabilities } from '../../src/decision-runtime/execution/decision-runtime-capabilities.util';
import { evaluateLegacyConvergence } from '../../src/decision-runtime/p4-phase/legacy-convergence.evaluator';
import { evaluateCanonicalDefaultPromotion } from '../../src/decision-runtime/p4-phase/canonical-default-promotion.evaluator';
import { evaluateConstraintRolloutPromotion } from '../../src/decision-runtime/p4-phase/constraint-rollout-promotion.evaluator';
import { snapshotConstraintOnRolloutCatalog } from '../../src/decision-runtime/p2-phase/constraint-on-rollout.catalog';
import { snapshotCanaryRolloutGovernance } from '../../src/decision-runtime/p2-phase/canary-rollout-governance.catalog';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'p4-phase-status');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [p4-status] ${line}`);
}

function readP3Closure(): { overall?: string } | null {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'artifacts/p3-phase-status/closure.json'), 'utf8'),
    );
  } catch {
    return null;
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const caps = resolveDecisionRuntimeCapabilities();
  const convergence = evaluateLegacyConvergence(caps);
  const constraintRollout = snapshotConstraintOnRolloutCatalog();
  const constraintPromotion = evaluateConstraintRolloutPromotion();
  const canonicalDefaultPromotion = evaluateCanonicalDefaultPromotion(caps);
  const canaryGovernance = snapshotCanaryRolloutGovernance();
  const p3Closure = readP3Closure();

  const blockers = [...convergence.blockers];
  if (p3Closure?.overall !== 'READY_FOR_P4') {
    blockers.unshift('P3 closure not READY_FOR_P4');
  }

  const report = {
    schemaId: 'tripnara.p4_phase_status@v1',
    generatedAt: new Date().toISOString(),
    phase: 'P4',
    p3ClosureOverall: p3Closure?.overall ?? 'UNKNOWN',
    convergence,
    constraintRollout,
    constraintPromotion,
    canonicalDefaultPromotion,
    canaryRolloutGovernance: canaryGovernance,
    localCapabilities: caps,
    blockers,
    nextSteps: [
      'Staging selective: use ladder CANONICAL_SELECTIVE recommendedEnv',
      'Run: npm run p4-staging:validate',
      'Constraint ON scenarios: review constraint-on-rollout catalog',
      'Trigger center: GET /decision-engine/v1/trigger-center/by-trip/:tripId',
      'Run: npm run constraint-rollout:status',
      'Run: npm run p4-selective:staging',
    ],
  };

  const outPath = path.join(OUT_DIR, 'status.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  log(`written ${outPath}`);
  log(`stage=${convergence.currentStage} target=${convergence.targetStage} canPromote=${convergence.canPromote}`);

  if (blockers.length) {
    log(`blockers (${blockers.length}): ${blockers.join('; ')}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
