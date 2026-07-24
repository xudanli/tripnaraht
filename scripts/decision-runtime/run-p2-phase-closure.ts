/**
 * P2 phase closure — aggregate gates, holdout, constraint ON, canary pilot.
 *
 * Usage:
 *   npm run p2-phase:closure
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { evaluateCanaryAdmissionGates } from '../../src/decision-runtime/p2-phase/canary-admission-gate.evaluator';
import { snapshotCanaryRolloutGovernance } from '../../src/decision-runtime/p2-phase/canary-rollout-governance.catalog';
import { findCompletedHoldoutRun } from '../../src/decision-runtime/p2-phase/canary-admission-gate.evaluator';

const OUT_DIR = path.join(process.cwd(), 'artifacts', 'p2-phase-status');

function readJson<T>(p: string): T | null {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
  } catch {
    return null;
  }
}

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [p2-closure] ${line}`);
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const canary = evaluateCanaryAdmissionGates();
  const holdout = findCompletedHoldoutRun();
  const holdoutSummary = holdout
    ? readJson<{ blindReviewSubmitted?: number; materializedReviewCases?: number }>(
        path.join(
          process.cwd(),
          'artifacts/task-e1-benchmark',
          holdout.runId,
          'reports/holdout-summary.json',
        ),
      )
    : null;
  const constraintShadow = readJson<{
    stagingMode?: string;
    summary?: { canonicalAuthorityProbesPass?: number };
  }>(path.join(process.cwd(), 'artifacts/constraint-shadow-staging/report.json'));
  const canaryPilot = readJson<{ pass?: boolean }>(
    path.join(process.cwd(), 'artifacts/p2-canary-pilot/report.json'),
  );
  const p2Staging = readJson<{ pass?: boolean }>(
    path.join(process.cwd(), 'artifacts/p2-staging-validation/report.json'),
  );

  const items = [
    { id: 'canary-gates', pass: canary.canaryReady, detail: `${canary.requiredPassed}/${canary.requiredTotal}` },
    { id: 'holdout-run', pass: Boolean(holdout), detail: holdout?.runId ?? 'missing' },
    {
      id: 'holdout-blind-review',
      pass:
        (holdoutSummary?.blindReviewSubmitted ?? 0) >=
        (holdoutSummary?.materializedReviewCases ?? 1),
      detail: `${holdoutSummary?.blindReviewSubmitted ?? 0}/${holdoutSummary?.materializedReviewCases ?? 0}`,
    },
    {
      id: 'constraint-on-for-selected-staging',
      pass:
        constraintShadow?.stagingMode === 'ON_FOR_SELECTED' &&
        (constraintShadow.summary?.canonicalAuthorityProbesPass ?? 0) >= 2,
      detail: constraintShadow?.stagingMode ?? 'no report',
    },
    { id: 'p2-staging-validation', pass: p2Staging?.pass === true, detail: String(p2Staging?.pass) },
    { id: 'lex-canary-pilot', pass: canaryPilot?.pass === true, detail: String(canaryPilot?.pass) },
  ];

  const failed = items.filter((i) => !i.pass);
  const overall = failed.length === 0 ? 'READY_FOR_P3' : 'IN_PROGRESS';

  const closure = {
    schemaId: 'tripnara.p2_phase_closure@v1',
    generatedAt: new Date().toISOString(),
    overall,
    items,
    canaryRolloutGovernance: snapshotCanaryRolloutGovernance().version,
    blockers: failed.map((f) => f.id),
    nextPhase: overall === 'READY_FOR_P3' ? 'Phase 3 — Monitoring 闭环' : items.filter((i) => !i.pass).map((i) => i.id),
  };

  const outPath = path.join(OUT_DIR, 'closure.json');
  fs.writeFileSync(outPath, JSON.stringify(closure, null, 2));
  log(`written ${outPath}`);
  log(`overall=${overall} failed=${failed.length}/${items.length}`);

  if (overall !== 'READY_FOR_P3') {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
