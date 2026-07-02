/**
 * CANONICAL_DEFAULT promotion preview — gate eval + optional :3001 HTTP probe.
 *
 * Usage:
 *   npm run p4-canonical-default:preview
 *   CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS=0 npm run p4-canonical-default:preview
 *   npm run p4-canonical-default:dev-3001   # start preview server then re-run
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { resolveDecisionRuntimeCapabilities } from '../../src/decision-runtime/execution/decision-runtime-capabilities.util';
import {
  buildCanonicalDefaultPreviewCapabilities,
  evaluateCanonicalDefaultPromotion,
} from '../../src/decision-runtime/p4-phase/canonical-default-promotion.evaluator';
import { evaluateLegacyConvergence } from '../../src/decision-runtime/p4-phase/legacy-convergence.evaluator';
import { snapshotConstraintOnRolloutCatalog } from '../../src/decision-runtime/p2-phase/constraint-on-rollout.catalog';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'p4-canonical-default-preview');
const BASE = (
  process.argv[2] ?? process.env.P4_CANONICAL_DEFAULT_BASE_URL ?? 'http://localhost:3001/api'
).replace(/\/$/, '');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [p4-canonical-preview] ${line}`);
}

async function httpProbe(base: string): Promise<Array<{ id: string; pass: boolean; detail: string }>> {
  const probes: Array<{ id: string; pass: boolean; detail: string }> = [];
  try {
    const res = await fetch(`${base}/decision-engine/v1/runtime-capabilities`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { success: boolean; data?: Record<string, unknown> };
    const caps = json.data ?? {};
    probes.push({
      id: 'http-mode-canonical',
      pass: caps.mode === 'CANONICAL',
      detail: String(caps.mode),
    });
    probes.push({
      id: 'http-constraint-on',
      pass: caps.constraintGatewayMode === 'ON',
      detail: String(caps.constraintGatewayMode),
    });
    probes.push({
      id: 'http-full-plan-selection',
      pass: caps.fullPlanSelection === true,
      detail: String(caps.fullPlanSelection),
    });
    const legacy = caps.legacyConvergence as { currentStage?: string } | undefined;
    probes.push({
      id: 'http-legacy-convergence',
      pass: legacy?.currentStage === 'CANONICAL_DEFAULT',
      detail: legacy?.currentStage ?? 'missing',
    });
  } catch (err) {
    probes.push({
      id: 'http-connectivity',
      pass: false,
      detail: err instanceof Error ? err.message : String(err),
    });
  }
  return probes;
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const savedObs = process.env.CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS;
  const observationBypass = savedObs === '0';
  if (!savedObs) {
    process.env.CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS = '0';
  }

  const caps = resolveDecisionRuntimeCapabilities();
  const currentEval = evaluateCanonicalDefaultPromotion(caps);
  const previewCaps = buildCanonicalDefaultPreviewCapabilities(caps);
  const simulatedEval = evaluateCanonicalDefaultPromotion(previewCaps);
  const rollout = snapshotConstraintOnRolloutCatalog();
  const convergencePreview = evaluateLegacyConvergence(previewCaps);
  const httpProbes = await httpProbe(BASE);

  if (savedObs === undefined) delete process.env.CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS;
  else process.env.CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS = savedObs;

  const report = {
    schemaId: 'tripnara.p4_canonical_default_preview@v1',
    generatedAt: new Date().toISOString(),
    observationBypass,
    constraintRollout: {
      onForSelected: rollout.onForSelectedCount,
      total: rollout.entryCount,
    },
    currentEnvEvaluation: currentEval,
    simulatedCanonicalDefaultEvaluation: simulatedEval,
    simulatedLegacyConvergence: convergencePreview,
    httpProbes,
    pass:
      simulatedEval.ready &&
      (httpProbes.length === 0 || httpProbes.every((p) => p.pass)),
    blockers: [
      ...simulatedEval.blockers.map((b) => `simulated:${b}`),
      ...httpProbes.filter((p) => !p.pass).map((p) => `http:${p.id}`),
    ],
    nextSteps: [
      'npm run p4-canonical-default:dev-3001',
      'CANONICAL_DEFAULT_MIN_OBSERVATION_DAYS=0 npm run p4-canonical-default:preview',
      'Production flip requires 30d observation (default) + change advisory',
    ],
  };

  const outPath = path.join(OUT_DIR, 'report.json');
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  log(`written ${outPath}`);
  log(`current env ready=${currentEval.ready} simulated ready=${simulatedEval.ready}`);
  log(`ON_FOR_SELECTED=${rollout.onForSelectedCount}/${rollout.entryCount}`);
  log(
    `http probes ${httpProbes.filter((p) => p.pass).length}/${httpProbes.length} @ ${BASE}`,
  );

  if (!simulatedEval.ready) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
