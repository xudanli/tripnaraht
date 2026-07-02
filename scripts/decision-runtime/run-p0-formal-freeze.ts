/**
 * Phase 0 — Formal calibration freeze orchestrator.
 *
 * Steps:
 *   1. Schema verification (E1 migration tables)
 *   2. Fault injection gate 29/29
 *   3. Calibration blind review 3/3 (submissions artifact or shadow API)
 *   4. Post-migration RDS baseline snapshot (record or skip)
 *   5. Manual evidence review refresh
 *   6. Freeze manifest generation
 *   7. Optional git tag (operator)
 *
 * Usage:
 *   npm run task-e1:p0-freeze
 *   npm run task-e1:p0-freeze -- --snapshot-id rds:... --database-identifier pgm-bp11qeau0n455339mo
 *   npm run task-e1:p0-freeze -- --test-tier-only
 *   npm run task-e1:p0-freeze -- --create-tag
 *
 * Env:
 *   E1_SMOKE_BENCHMARK_RUN_ID (default bench_56625dc6-44ff-4874-94f7-bcaf876d0f48)
 *   E1_CALIBRATION_BENCHMARK_RUN_ID (default bench_eab3892f-b7e7-4f15-b1e5-440fea2b3047)
 *   E1_POST_MIGRATION_SNAPSHOT_ID + E1_DATABASE_IDENTIFIER (alternative to CLI flags)
 *   SHADOW_REVIEW_BASE_URL (default http://localhost:3001/api)
 */

import 'dotenv/config';
import { execSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as fsSync from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import {
  gateFilePath,
  readFaultInjectionGate,
} from '../../src/decision-runtime/benchmark/benchmark-fault-injection-gate.util';
import { resolveGitCommit } from '../../src/decision-runtime/benchmark/benchmark-config.util';

const FREEZE_ROOT = path.join(process.cwd(), 'artifacts/task-e1-freeze');
const P0_STATUS = path.join(FREEZE_ROOT, 'p0-freeze-status.json');
const DEPLOYMENT_MANIFEST = path.join(process.cwd(), 'artifacts/task-e1-deployment/deployment-manifest.json');
const DEFAULT_SMOKE_RUN = 'bench_56625dc6-44ff-4874-94f7-bcaf876d0f48';
const DEFAULT_CALIBRATION_RUN = 'bench_eab3892f-b7e7-4f15-b1e5-440fea2b3047';
const FREEZE_TAG = 'decision-benchmark-calibration-v1';
const CALIBRATION_TRIPS = [
  'bench_calibration_REAL_MULTI_CANDIDATE_001',
  'bench_calibration_REAL_MULTI_CANDIDATE_002',
  'bench_calibration_TD_006_three_way',
];

type StepResult = {
  id: string;
  status: 'PASS' | 'FAIL' | 'SKIP' | 'BLOCKED';
  detail: string;
};

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [p0-freeze] ${line}`);
}

function parseArgs(argv: string[]) {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  return {
    snapshotId: get('--snapshot-id') ?? process.env.E1_POST_MIGRATION_SNAPSHOT_ID,
    databaseIdentifier:
      get('--database-identifier') ??
      process.env.E1_DATABASE_IDENTIFIER ??
      'pgm-bp11qeau0n455339mo',
    operator: get('--operator') ?? process.env.USER ?? 'unknown',
    smokeRunId: process.env.E1_SMOKE_BENCHMARK_RUN_ID ?? DEFAULT_SMOKE_RUN,
    calibrationRunId: process.env.E1_CALIBRATION_BENCHMARK_RUN_ID ?? DEFAULT_CALIBRATION_RUN,
    testTierOnly: argv.includes('--test-tier-only'),
    allowDirty: argv.includes('--allow-dirty'),
    createTag: argv.includes('--create-tag'),
    shadowBase: (process.env.SHADOW_REVIEW_BASE_URL ?? 'http://localhost:3001/api').replace(
      /\/$/,
      '',
    ),
  };
}

function gitWorkingTreeClean(): boolean {
  return execSync('git status --porcelain', { encoding: 'utf8' }).trim().length === 0;
}

async function loadJson<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

function runTsx(script: string, args: string[] = []): void {
  const tsxBin = path.join(process.cwd(), 'node_modules', '.bin', 'tsx');
  const cmd = fsSync.existsSync(tsxBin) ? tsxBin : 'npx';
  const cmdArgs =
    cmd === tsxBin ? [script, ...args] : ['--yes', 'tsx', script, ...args];
  const result = spawnSync(cmd, cmdArgs, {
    stdio: 'inherit',
    cwd: process.cwd(),
    timeout: 120_000,
    env: process.env,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`${script} exited with code ${result.status ?? 'unknown'}`);
  }
}

async function stepVerifySchema(): Promise<StepResult> {
  const cached = path.join(
    process.cwd(),
    'artifacts/task-e1-deployment/schema-verification.json',
  );
  const cachedDoc = await loadJson<{ e1MigrationApplied?: boolean; verifiedAt?: string }>(cached);
  if (cachedDoc?.e1MigrationApplied) {
    return {
      id: 'schema-verification',
      status: 'PASS',
      detail: `cached ${cached} (${cachedDoc.verifiedAt ?? 'unknown'})`,
    };
  }
  try {
    runTsx('scripts/decision-runtime/run-e1-deployment.ts', ['--verify-schema']);
    return { id: 'schema-verification', status: 'PASS', detail: 'E1 tables + lease columns OK' };
  } catch (err) {
    return {
      id: 'schema-verification',
      status: 'FAIL',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function stepFaultInjectionGate(): Promise<StepResult> {
  try {
    const gate = await readFaultInjectionGate();
    if (gate.passed === 29 && gate.failed === 0 && gate.skipped === 0) {
      return {
        id: 'fault-injection-gate',
        status: 'PASS',
        detail: `29/29 PASS (${gate.executedAt ?? 'unknown'})`,
      };
    }
    return {
      id: 'fault-injection-gate',
      status: 'FAIL',
      detail: `expected 29/0/0 got ${gate.passed}/${gate.failed}/${gate.skipped}`,
    };
  } catch (err) {
    return {
      id: 'fault-injection-gate',
      status: 'FAIL',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function stepBlindReview(
  calibrationRunId: string,
  shadowBase: string,
): Promise<StepResult> {
  const submissionsPath = path.join(
    process.cwd(),
    'artifacts/task-e1-benchmark',
    calibrationRunId,
    'reports/blind-review-submissions.json',
  );
  const submissions = await loadJson<{
    summary?: { submittedCount?: number; allCompleted?: boolean };
    submissions?: unknown[];
  }>(submissionsPath);

  if (submissions?.summary?.submittedCount === 3 && submissions.summary.allCompleted) {
    return {
      id: 'blind-review-3-cases',
      status: 'PASS',
      detail: `artifact ${submissionsPath} (3/3 COMPLETED)`,
    };
  }

  try {
    const res = await fetch(
      `${shadowBase}/decision-engine/v1/shadow-reviews/queue?status=COMPLETED&limit=50`,
      { signal: AbortSignal.timeout(5000) },
    );
    const json = (await res.json()) as {
      success?: boolean;
      data?: { items?: Array<{ tripId: string; status: string }> };
    };
    const items = json.data?.items ?? [];
    const count = CALIBRATION_TRIPS.filter((tripId) =>
      items.some((i) => i.tripId === tripId && i.status === 'COMPLETED'),
    ).length;
    if (count >= 3) {
      return {
        id: 'blind-review-3-cases',
        status: 'PASS',
        detail: `shadow API ${count}/3 calibration trips COMPLETED`,
      };
    }
    return {
      id: 'blind-review-3-cases',
      status: 'FAIL',
      detail: `only ${count}/3 calibration blind reviews COMPLETED`,
    };
  } catch (err) {
    return {
      id: 'blind-review-3-cases',
      status: 'FAIL',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function stepRecordSnapshot(
  snapshotId: string | undefined,
  databaseIdentifier: string,
  operator: string,
  testTierOnly: boolean,
): Promise<StepResult> {
  if (snapshotId) {
    runTsx('scripts/decision-runtime/run-e1-deployment.ts', [
      '--record-post-migration-snapshot',
      '--snapshot-id',
      snapshotId,
      '--database-identifier',
      databaseIdentifier,
      '--operator',
      operator,
      '--database-version',
      'PostgreSQL 17.6',
    ]);
    return {
      id: 'post-migration-snapshot',
      status: 'PASS',
      detail: `recorded snapshotId=${snapshotId}`,
    };
  }

  const manifest = await loadJson<{
    postMigrationBaselineSnapshot?: { status?: string; snapshotId?: string };
  }>(DEPLOYMENT_MANIFEST);
  const post = manifest?.postMigrationBaselineSnapshot;
  if (post?.status === 'available' && post.snapshotId) {
    return {
      id: 'post-migration-snapshot',
      status: 'PASS',
      detail: `already recorded snapshotId=${post.snapshotId}`,
    };
  }

  if (testTierOnly) {
    if (post?.status === 'SKIPPED_TEST_ENV') {
      return {
        id: 'post-migration-snapshot',
        status: 'SKIP',
        detail: 'already SKIPPED_TEST_ENV in deployment-manifest.json',
      };
    }
    runTsx('scripts/decision-runtime/run-e1-deployment.ts', [
      '--skip-post-migration-snapshot',
      '--database-identifier',
      databaseIdentifier,
      '--operator',
      operator,
      '--database-version',
      'PostgreSQL 17.6',
    ]);
    return {
      id: 'post-migration-snapshot',
      status: 'SKIP',
      detail: 'SKIPPED_TEST_ENV — formal tier requires Aliyun RDS snapshot ID',
    };
  }

  if (post?.status === 'SKIPPED_TEST_ENV') {
    return {
      id: 'post-migration-snapshot',
      status: 'BLOCKED',
      detail:
        'deployment-manifest has SKIPPED_TEST_ENV — re-run with --snapshot-id or --test-tier-only',
    };
  }

  return {
    id: 'post-migration-snapshot',
    status: 'BLOCKED',
    detail:
      'Provide --snapshot-id (Aliyun RDS console → Create Snapshot → copy BackupSetId) or --test-tier-only',
  };
}

async function stepManualReview(smokeRunId: string, operator: string): Promise<StepResult> {
  try {
    runTsx('scripts/decision-runtime/run-manual-evidence-review.ts', [
      smokeRunId,
      '--reviewer',
      operator,
    ]);
    const review = await loadJson<{ readyForFreeze?: boolean; overallVerdict?: string }>(
      path.join(
        process.cwd(),
        'artifacts/task-e1-benchmark',
        smokeRunId,
        'reports/manual-evidence-review.json',
      ),
    );
    if (review?.readyForFreeze) {
      return {
        id: 'manual-evidence-review',
        status: 'PASS',
        detail: `readyForFreeze=true verdict=${review.overallVerdict ?? 'unknown'}`,
      };
    }
    return { id: 'manual-evidence-review', status: 'FAIL', detail: 'readyForFreeze=false' };
  } catch (err) {
    return {
      id: 'manual-evidence-review',
      status: 'FAIL',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function stepFreeze(
  smokeRunId: string,
  testTierOnly: boolean,
  allowDirty: boolean,
): Promise<StepResult> {
  const flags = [
    smokeRunId,
    ...(testTierOnly ? ['--allow-skip-post-migration-snapshot'] : []),
    ...(allowDirty ? ['--allow-dirty'] : []),
  ];
  try {
    runTsx('scripts/decision-runtime/run-e1-freeze.ts', flags);
    const manifest = await loadJson<{ freezeTier?: string }>(
      path.join(FREEZE_ROOT, 'calibration-v1-freeze-manifest.json'),
    );
    return {
      id: 'freeze-manifest',
      status: 'PASS',
      detail: `tier=${manifest?.freezeTier ?? 'unknown'}`,
    };
  } catch (err) {
    return {
      id: 'freeze-manifest',
      status: 'FAIL',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function stepGitTag(createTag: boolean, allowDirty: boolean): Promise<StepResult> {
  if (!createTag) {
    return {
      id: 'git-tag',
      status: 'SKIP',
      detail: `manual: git tag ${FREEZE_TAG} && git push origin ${FREEZE_TAG}`,
    };
  }
  if (!allowDirty && !gitWorkingTreeClean()) {
    return {
      id: 'git-tag',
      status: 'BLOCKED',
      detail: 'working tree dirty — commit first or pass --allow-dirty',
    };
  }
  try {
    execSync(`git tag -a ${FREEZE_TAG} -m "Decision benchmark calibration v1 freeze"`, {
      stdio: 'inherit',
    });
    return { id: 'git-tag', status: 'PASS', detail: `created tag ${FREEZE_TAG}` };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('already exists')) {
      return { id: 'git-tag', status: 'PASS', detail: `tag ${FREEZE_TAG} already exists` };
    }
    return { id: 'git-tag', status: 'FAIL', detail: msg };
  }
}

async function enrichFreezeManifest(calibrationRunId: string): Promise<void> {
  const manifestPath = path.join(FREEZE_ROOT, 'calibration-v1-freeze-manifest.json');
  const manifest = await loadJson<Record<string, unknown>>(manifestPath);
  if (!manifest) return;

  const blindPath = path.join(
    process.cwd(),
    'artifacts/task-e1-benchmark',
    calibrationRunId,
    'reports/blind-review-submissions.json',
  );
  let blindReviewSubmissionsHash: string | undefined;
  try {
    const body = await fs.readFile(blindPath, 'utf8');
    blindReviewSubmissionsHash = createHash('sha256').update(body).digest('hex');
  } catch {
    /* optional */
  }

  const enriched = {
    ...manifest,
    calibrationBenchmarkRunId: calibrationRunId,
    blindReviewSubmissionsArtifact: blindPath.replace(process.cwd() + path.sep, ''),
    blindReviewSubmissionsHash,
    p0CompletedAt: new Date().toISOString(),
  };
  delete (enriched as { manifestHash?: string }).manifestHash;
  const { hashJson } = await import('../../src/decision-runtime/benchmark/benchmark-artifact.util');
  const withHash = { ...enriched, manifestHash: hashJson(enriched) };
  await fs.writeFile(manifestPath, JSON.stringify(withHash, null, 2));
  log(`Enriched freeze manifest with calibration run + blind review hash`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  await fs.mkdir(FREEZE_ROOT, { recursive: true });

  log(`P0 formal freeze — smoke=${opts.smokeRunId} calibration=${opts.calibrationRunId}`);
  log(`gitCommit=${resolveGitCommit()} clean=${gitWorkingTreeClean()}`);

  const steps: StepResult[] = [];
  steps.push(await stepVerifySchema());
  steps.push(await stepFaultInjectionGate());
  steps.push(await stepBlindReview(opts.calibrationRunId, opts.shadowBase));
  steps.push(
    await stepRecordSnapshot(
      opts.snapshotId,
      opts.databaseIdentifier,
      opts.operator,
      opts.testTierOnly,
    ),
  );

  const hardFail = steps.some((s) => s.status === 'FAIL');
  const blocked = steps.some((s) => s.status === 'BLOCKED');
  if (hardFail || blocked) {
    for (const s of steps) log(`  [${s.status}] ${s.id}: ${s.detail}`);
    log('P0 aborted before freeze — fix failing steps');
    await writeStatus(opts, steps, 'ABORTED');
    process.exit(1);
  }

  steps.push(await stepManualReview(opts.smokeRunId, opts.operator));
  steps.push(await stepFreeze(opts.smokeRunId, opts.testTierOnly, opts.allowDirty));
  if (steps.some((s) => s.id === 'freeze-manifest' && s.status === 'FAIL')) {
    await writeStatus(opts, steps, 'FREEZE_FAILED');
    process.exit(1);
  }

  await enrichFreezeManifest(opts.calibrationRunId);
  steps.push(await stepGitTag(opts.createTag, opts.allowDirty));

  const formalReady = steps.some(
    (s) => s.id === 'post-migration-snapshot' && s.status === 'PASS' && s.detail.includes('snapshotId'),
  );
  const overall = formalReady ? 'FORMAL_READY' : 'TEST_TIER_COMPLETE';
  await writeStatus(opts, steps, overall);

  for (const s of steps) log(`  [${s.status}] ${s.id}: ${s.detail}`);
  log(`P0 status → ${P0_STATUS} (${overall})`);
  if (!formalReady) {
    log(
      'Formal tier blocked: create Aliyun RDS post-migration snapshot, then re-run with --snapshot-id <BackupSetId>',
    );
  }
}

async function writeStatus(
  opts: ReturnType<typeof parseArgs>,
  steps: StepResult[],
  overall: string,
) {
  const gate = await loadJson<Record<string, unknown>>(gateFilePath());
  const payload = {
    schemaId: 'tripnara.e1_p0_freeze_status@v1',
    overall,
    generatedAt: new Date().toISOString(),
    gitCommit: resolveGitCommit(),
    gitWorkingTreeClean: gitWorkingTreeClean(),
    smokeBenchmarkRunId: opts.smokeRunId,
    calibrationBenchmarkRunId: opts.calibrationRunId,
    freezeTag: FREEZE_TAG,
    steps,
    nextActions:
      overall === 'FORMAL_READY'
        ? [`git tag ${FREEZE_TAG}`, `git push origin ${FREEZE_TAG}`]
        : [
            'Aliyun RDS Console → pgm-bp11qeau0n455339mo → Create Snapshot (post E1 migration)',
            'npm run task-e1:p0-freeze -- --snapshot-id <BackupSetId>',
            `git tag ${FREEZE_TAG} (after clean commit)`,
          ],
    faultInjectionGate: gate,
  };
  await fs.writeFile(P0_STATUS, JSON.stringify(payload, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
