/**
 * CANONICAL_DEFAULT staging closure — milestone after selective + preview env.
 *
 * Usage:
 *   CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS=0 npm run p4-canonical-default:closure
 *   npm run p4-canonical-default:dev-3001   # optional — enables HTTP probe item
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { resolveDecisionRuntimeCapabilities } from '../../src/decision-runtime/execution/decision-runtime-capabilities.util';
import {
  buildCanonicalDefaultPreviewCapabilities,
  evaluateCanonicalDefaultPromotion,
  isCanonicalDefaultStagingReady,
} from '../../src/decision-runtime/p4-phase/canonical-default-promotion.evaluator';
import { evaluateLegacyConvergence } from '../../src/decision-runtime/p4-phase/legacy-convergence.evaluator';
import { snapshotConstraintOnRolloutCatalog } from '../../src/decision-runtime/p2-phase/constraint-on-rollout.catalog';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'p4-canonical-default-status');

function readJson<T>(p: string): T | null {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [p4-canonical-closure] ${line}`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const observationBypass =
    process.env.CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS === '0' ||
    process.env.CANONICAL_DEFAULT_STAGING_CLOSURE === '1';

  const p4Closure = readJson<{ overall?: string }>(
    path.join(process.cwd(), 'artifacts/p4-phase-status/closure.json'),
  );
  const previewReport = readJson<{
    pass?: boolean;
    httpProbes?: Array<{ id: string; pass: boolean }>;
  }>(path.join(process.cwd(), 'artifacts/p4-canonical-default-preview/report.json'));

  const caps = resolveDecisionRuntimeCapabilities();
  const previewCaps = buildCanonicalDefaultPreviewCapabilities(caps);
  const rollout = snapshotConstraintOnRolloutCatalog();
  const promotionEval = evaluateCanonicalDefaultPromotion(previewCaps);
  const convergence = evaluateLegacyConvergence(previewCaps);
  const stagingReady = isCanonicalDefaultStagingReady(previewCaps, { observationBypass: true });

  const httpProbePass =
    previewReport?.httpProbes?.every((p) => p.pass) ?? previewReport?.pass === true;

  const items = [
    {
      id: 'selective-closure',
      pass: p4Closure?.overall === 'CANONICAL_SELECTIVE_READY',
      detail: p4Closure?.overall ?? 'missing',
    },
    {
      id: 'constraint-rollout-7-7',
      pass: rollout.onForSelectedCount === rollout.entryCount,
      detail: `${rollout.onForSelectedCount}/${rollout.entryCount}`,
    },
    {
      id: 'canonical-default-promotion-gates',
      pass: stagingReady && promotionEval.ready,
      detail: promotionEval.blockers.join(', ') || 'ready',
    },
    {
      id: 'legacy-convergence-stage',
      pass: convergence.currentStage === 'CANONICAL_DEFAULT',
      detail: convergence.currentStage,
    },
    {
      id: 'canonical-preview-http',
      pass: httpProbePass === true,
      detail: previewReport
        ? `${previewReport.httpProbes?.filter((p) => p.pass).length ?? 0}/${previewReport.httpProbes?.length ?? 0}`
        : 'run p4-canonical-default:dev-3001',
    },
    {
      id: 'observation-window',
      pass: observationBypass || promotionEval.gates.find((g) => g.gateId === 'observation-window')?.pass === true,
      detail: observationBypass
        ? 'bypassed for staging'
        : promotionEval.gates.find((g) => g.gateId === 'observation-window')?.detail ?? 'missing',
    },
  ];

  const failed = items.filter((i) => !i.pass);
  const overall =
    failed.length === 0
      ? observationBypass
        ? 'CANONICAL_DEFAULT_STAGING_READY'
        : 'CANONICAL_DEFAULT_READY'
      : 'IN_PROGRESS';

  const closure = {
    schemaId: 'tripnara.p4_canonical_default_closure@v1',
    generatedAt: new Date().toISOString(),
    overall,
    observationBypass,
    items,
    blockers: failed.map((f) => f.id),
    promotionEvaluation: promotionEval,
    nextMilestone: observationBypass
      ? 'Production flip: 30d observation + change advisory (unset CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS)'
      : 'LEGACY_FALLBACK runbook validation',
  };

  const outPath = path.join(OUT_DIR, 'closure.json');
  fs.writeFileSync(outPath, JSON.stringify(closure, null, 2));
  log(`written ${outPath}`);
  log(`overall=${overall} failed=${failed.length}/${items.length}`);

  if (overall === 'IN_PROGRESS') {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
