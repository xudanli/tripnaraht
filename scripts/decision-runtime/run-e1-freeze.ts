/**
 * Task E1 — Calibration v1 freeze manifest generator.
 *
 * Preconditions (hard gate):
 *   - manual-evidence-review.json readyForFreeze
 *   - calibration smoke PASSED
 *   - fault injection 29/29
 *   - postMigrationBaselineSnapshot.status === available
 *     OR (test env) status === SKIPPED_TEST_ENV + --allow-skip-post-migration-snapshot
 *   - clean git working tree (unless --allow-dirty)
 *
 * Usage:
 *   npm run task-e1:freeze -- bench_86c96cb1-9ed6-4f92-be13-ebe3944481bf
 *   npm run task-e1:freeze -- bench_<id> --allow-skip-post-migration-snapshot
 *
 * Does NOT create git tag — operator runs:
 *   git tag decision-benchmark-calibration-v1
 *   git push origin decision-benchmark-calibration-v1
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import {
  hashJson,
} from '../../src/decision-runtime/benchmark/benchmark-artifact.util';
import {
  gateFilePath,
  readFaultInjectionGate,
} from '../../src/decision-runtime/benchmark/benchmark-fault-injection-gate.util';
import { resolveGitCommit } from '../../src/decision-runtime/benchmark/benchmark-config.util';

const FREEZE_TAG = 'decision-benchmark-calibration-v1';
const DEPLOYMENT_MANIFEST = path.join(process.cwd(), 'artifacts/task-e1-deployment/deployment-manifest.json');
const FREEZE_ROOT = path.join(process.cwd(), 'artifacts/task-e1-freeze');
const FREEZE_MANIFEST = path.join(FREEZE_ROOT, 'calibration-v1-freeze-manifest.json');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [e1-freeze] ${line}`);
}

function parseArgs(argv: string[]) {
  const positional = argv.filter((a) => !a.startsWith('--'));
  const benchmarkRunId = positional[0];
  if (!benchmarkRunId) {
    throw new Error(
      'Usage: run-e1-freeze.ts <smokeBenchmarkRunId> [--allow-dirty] [--allow-skip-post-migration-snapshot]',
    );
  }
  return {
    benchmarkRunId,
    allowDirty: argv.includes('--allow-dirty'),
    allowSkipPostMigrationSnapshot: argv.includes('--allow-skip-post-migration-snapshot'),
    dockerImageDigest: argv.includes('--docker-digest')
      ? argv[argv.indexOf('--docker-digest') + 1]
      : process.env.E1_FREEZE_DOCKER_DIGEST,
  };
}

function gitWorkingTreeClean(): boolean {
  const status = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
  return status.length === 0;
}

async function loadJson<T>(filePath: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const errors: string[] = [];

  if (!opts.allowDirty && !gitWorkingTreeClean()) {
    errors.push('git working tree not clean (use --allow-dirty to override)');
  }

  const reviewPath = path.join(
    process.cwd(),
    'artifacts/task-e1-benchmark',
    opts.benchmarkRunId,
    'reports/manual-evidence-review.json',
  );
  let reviewBody: string;
  try {
    reviewBody = await fs.readFile(reviewPath, 'utf8');
  } catch {
    errors.push(`manual evidence review missing: ${reviewPath}`);
    reviewBody = '{}';
  }
  const review = JSON.parse(reviewBody) as {
    readyForFreeze?: boolean;
    overallVerdict?: string;
  };
  if (!review?.readyForFreeze) {
    errors.push(`manual evidence review not ready: ${reviewPath}`);
  }
  const manualEvidenceReviewHash = createHash('sha256').update(reviewBody).digest('hex');

  const smokePath = path.join(
    process.cwd(),
    'artifacts/task-e1-benchmark',
    opts.benchmarkRunId,
    'reports/calibration-smoke-summary.json',
  );
  const smoke = await loadJson<{ passed?: boolean; frozen?: Record<string, unknown> }>(smokePath);
  if (!smoke?.passed) {
    errors.push(`calibration smoke not passed: ${smokePath}`);
  }

  let gate;
  try {
    gate = await readFaultInjectionGate();
  } catch (err) {
    errors.push(`fault injection gate: ${err instanceof Error ? err.message : String(err)}`);
  }
  if (gate && (gate.failed !== 0 || gate.skipped !== 0 || gate.passed !== 29)) {
    errors.push(`fault injection gate not 29/0/0 (got ${gate.passed}/${gate.failed}/${gate.skipped})`);
  }

  const deployment = await loadJson<{
    preMigrationBackup?: { status?: string };
    postMigrationBaselineSnapshot?: {
      snapshotId?: string;
      status?: string;
      reason?: string;
      databaseIdentifier?: string;
      createdAt?: string;
      acknowledgedAt?: string;
    };
    migration?: { migrationVersion?: string };
  }>(DEPLOYMENT_MANIFEST);

  const postSnap = deployment?.postMigrationBaselineSnapshot;
  const snapshotAvailable =
    Boolean(postSnap?.snapshotId) && postSnap?.status === 'available';
  const snapshotSkippedTestEnv = postSnap?.status === 'SKIPPED_TEST_ENV';

  if (snapshotAvailable) {
    // formal path
  } else if (snapshotSkippedTestEnv && opts.allowSkipPostMigrationSnapshot) {
    log('Test-env waiver: postMigrationBaselineSnapshot SKIPPED_TEST_ENV accepted');
  } else if (snapshotSkippedTestEnv) {
    errors.push(
      'postMigrationBaselineSnapshot is SKIPPED_TEST_ENV — re-run with --allow-skip-post-migration-snapshot for test-tier freeze',
    );
  } else {
    errors.push(
      'postMigrationBaselineSnapshot missing or not available — record snapshot or npm run task-e1:skip-post-migration-snapshot',
    );
  }

  if (errors.length > 0) {
    log('Freeze gate FAILED:');
    for (const e of errors) log(`  - ${e}`);
    process.exit(1);
  }

  const smokeReportBody = await fs.readFile(smokePath, 'utf8');
  const smokeReportHash = createHash('sha256').update(smokeReportBody).digest('hex');
  const gateBody = await fs.readFile(gateFilePath(), 'utf8');
  const faultInjectionGateHash = createHash('sha256').update(gateBody).digest('hex');

  const gitCommit = resolveGitCommit();
  const frozen = smoke.frozen ?? {};

  const freezeTier = snapshotAvailable ? 'formal' : 'test';

  const manifest = {
    schemaId: 'tripnara.e1_calibration_freeze@v1',
    freezeTag: FREEZE_TAG,
    freezeTier,
    frozenAt: new Date().toISOString(),
    gitCommit,
    dockerImageDigest: opts.dockerImageDigest ?? null,
    databaseSchemaVersion: deployment?.migration?.migrationVersion ?? gate?.migrationVersion,
    datasetChecksum: frozen.datasetChecksum,
    configHash: frozen.configHash,
    objectiveRegistryVersion: frozen.objectiveRegistryVersion,
    constraintPolicyVersion: frozen.constraintPolicyVersion,
    strategyVersion: {
      authority: '1.0.0',
      shadow: '1.0.0-cp-sat-lex-v1',
    },
    solverEngine: frozen.solverEngine,
    migrationVersions: {
      e0: '20260701160000_shadow_review_evidence',
      e1: '20260701170000_benchmark_batch_runner',
    },
    faultInjectionGateHash,
    smokeBenchmarkRunId: opts.benchmarkRunId,
    smokeReportHash,
    manualEvidenceReviewHash,
    preMigrationBackup: deployment?.preMigrationBackup,
    postMigrationBaselineSnapshot: postSnap,
    runtimePolicy: {
      mode: 'SHADOW',
      canonicalFullPlanSelection: true,
      canonicalExecutionEnabled: false,
    },
    calibrationRunPolicy: {
      split: 'calibration',
      maxInstances: 15,
      concurrency: 1,
      mustNotResumeSmokeRun: true,
      checkoutTag: FREEZE_TAG,
    },
    tagCommands: [
      `git tag ${FREEZE_TAG}`,
      `git push origin ${FREEZE_TAG}`,
    ],
    calibrationCommand: [
      `git checkout ${FREEZE_TAG}`,
      'npm run task-e1:benchmark-batch -- http://localhost:3001/api --split calibration --concurrency 1 --max-instances 15',
    ],
  };

  await fs.mkdir(FREEZE_ROOT, { recursive: true });
  const { manifestHash: _omit, ...manifestBody } = manifest as Record<string, unknown> & {
    manifestHash?: string;
  };
  const manifestWithHash = {
    ...manifestBody,
    manifestHash: hashJson(manifestBody),
  };
  await fs.writeFile(FREEZE_MANIFEST, JSON.stringify(manifestWithHash, null, 2));

  log(`Freeze manifest → ${FREEZE_MANIFEST} (tier=${freezeTier})`);
  if (freezeTier === 'formal') {
    log(`Tag (manual): git tag ${FREEZE_TAG} && git push origin ${FREEZE_TAG}`);
  } else {
    log(
      'Test-tier freeze — tag optional; results are exploratory until formal RDS baseline snapshot is recorded',
    );
  }
  log(`Then start NEW 15-instance calibration run from tag (do not resume smoke run).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
