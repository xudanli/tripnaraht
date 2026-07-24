/**
 * Summarize holdout benchmark run + blind review status.
 *
 * Usage:
 *   npm run task-e1:holdout-summary
 *   npm run task-e1:holdout-summary -- bench_7a43e23d-d7ef-4e60-9efe-c94ce45013f5
 */

import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { findCompletedHoldoutRun } from '../../src/decision-runtime/p2-phase/canary-admission-gate.evaluator';

const SHADOW_BASE = (
  process.env.SHADOW_REVIEW_BASE_URL ?? 'http://localhost:3001/api'
).replace(/\/$/, '');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [holdout-summary] ${line}`);
}

async function fetchReviewStatus(reviewCaseId: string) {
  const res = await fetch(
    `${SHADOW_BASE}/decision-engine/v1/shadow-reviews/${encodeURIComponent(reviewCaseId)}`,
  );
  const json = (await res.json()) as {
    success: boolean;
    data?: { status: string; reviewAssignments?: unknown[] };
  };
  return json.data ?? null;
}

async function main() {
  const runIdArg = process.argv[2];
  const holdout =
    runIdArg && runIdArg.startsWith('bench_')
      ? {
          runId: runIdArg,
          progress: JSON.parse(
            fs.readFileSync(
              path.join(
                process.cwd(),
                'artifacts/task-e1-benchmark',
                runIdArg,
                'reports/benchmark-progress.json',
              ),
              'utf8',
            ),
          ),
        }
      : findCompletedHoldoutRun();

  if (!holdout) {
    throw new Error('No completed holdout run found');
  }

  const runDir = path.join(
    process.cwd(),
    'artifacts/task-e1-benchmark',
    holdout.runId,
  );
  const instances = holdout.progress.instances ?? [];
  const materialized = instances.filter((i) => i.reviewCaseId);

  const blindReviews = [];
  for (const inst of materialized) {
    const review = inst.reviewCaseId
      ? await fetchReviewStatus(inst.reviewCaseId)
      : null;
    blindReviews.push({
      instanceId: inst.instanceId,
      reviewCaseId: inst.reviewCaseId,
      tripId: inst.instanceId.replace('HOLDOUT', 'bench_holdout').replace(/-(\d+)$/, (_, n) => `_${n}`),
      status: review?.status ?? 'UNKNOWN',
      submitted: (review?.reviewAssignments?.length ?? 0) > 0,
    });
  }

  const summary = {
    schemaId: 'tripnara.holdout_summary@v1',
    generatedAt: new Date().toISOString(),
    benchmarkRunId: holdout.runId,
    calibrationFreezeTag: 'decision-benchmark-calibration-v1',
    counters: holdout.progress.counters,
    materializedReviewCases: materialized.length,
    blindReviewSubmitted: blindReviews.filter((b) => b.submitted).length,
    blindReviews,
    excludedInstances: instances
      .filter((i) => i.status === 'EXCLUDED')
      .map((i) => i.instanceId),
  };

  const outPath = path.join(runDir, 'reports/holdout-summary.json');
  fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
  log(`written ${outPath}`);
  log(
    `holdout ${holdout.runId}: blindReview ${summary.blindReviewSubmitted}/${summary.materializedReviewCases} submitted`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
