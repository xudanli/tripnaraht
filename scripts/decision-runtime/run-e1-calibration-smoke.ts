/**
 * Task E1.2 — 3-instance Calibration Staging smoke (controller + production runner).
 *
 * Does NOT: migrate DB, restart server, fuser -k, modify env, or generate blinding keys.
 *
 * Usage:
 *   npm run task-e1:calibration-smoke
 *   npm run task-e1:calibration-smoke -- http://localhost:3001/api
 *   npm run task-e1:calibration-smoke -- --skip-fault-injection-gate
 *   npm run task-e1:calibration-smoke -- --interrupt-after authority-artifact
 *   npm run task-e1:calibration-smoke -- --resume-only <benchmarkRunId>
 *
 * Formal execution order (hard gate):
 *   RDS backup → E1 migration → fault injection 29/29 → this smoke → 15-instance calibration
 */

import { spawn } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { newBenchmarkRunId } from '../../src/decision-runtime/benchmark/benchmark-run.store';
import { BenchmarkRunStore } from '../../src/decision-runtime/benchmark/benchmark-run.store';
import {
  CALIBRATION_SMOKE_INTERRUPT_TARGET,
  parseInterruptStage,
  type CalibrationSmokeInterruptStage,
} from '../../src/decision-runtime/benchmark/benchmark-calibration-smoke';
import {
  runCalibrationSmokePreflight,
  type PreflightReport,
} from '../../src/decision-runtime/benchmark/e1-calibration-smoke-preflight';
import {
  reconcileSmokeEvidence,
  assertSmokeRunAcceptance,
  validateTransitionGuardSamples,
} from '../../src/decision-runtime/benchmark/e1-calibration-smoke-reconcile';
import { deriveReviewDisposition } from '../../src/decision-runtime/benchmark/benchmark-review-disposition.util';
import {
  instanceArtifactDir,
  artifactExists,
  readArtifact,
  hashJson,
} from '../../src/decision-runtime/benchmark/benchmark-artifact.util';
import { runArtifactRoot } from '../../src/decision-runtime/benchmark/benchmark-progress.util';

const DEFAULT_BASE = 'http://localhost:3001/api';
const BATCH_SCRIPT = path.join(process.cwd(), 'scripts/decision-runtime/run-benchmark-batch.ts');
const SMOKE_HOLD_MS = 120_000;

interface SmokeOptions {
  baseUrl: string;
  skipFaultInjectionGate: boolean;
  interruptAfter: CalibrationSmokeInterruptStage;
  resumeOnly?: string;
  skipInterrupt: boolean;
}

function log(line: string) {
  console.log(`[${new Date().toISOString()}] [e1-cal-smoke] ${line}`);
}

function parseArgs(argv: string[]): SmokeOptions {
  const get = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const resumeOnly = get('--resume-only');
  const interruptRaw = get('--interrupt-after');
  return {
    baseUrl: (argv.find((a) => a.startsWith('http')) ?? DEFAULT_BASE).replace(/\/$/, ''),
    skipFaultInjectionGate: argv.includes('--skip-fault-injection-gate'),
    interruptAfter: resumeOnly ? 'none' : parseInterruptStage(interruptRaw ?? 'after-authority-artifact'),
    resumeOnly,
    skipInterrupt: argv.includes('--skip-interrupt') || Boolean(resumeOnly),
  };
}

async function writeJson(filePath: string, payload: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2));
}

async function collectAuthorityMetrics(
  store: BenchmarkRunStore,
  benchmarkRunId: string,
  instanceIds: string[],
) {
  const instances = await store.listInstances(benchmarkRunId);
  const scoped = instances.filter((i) => instanceIds.includes(i.instanceId));
  const byInstance: Array<{
    instanceId: string;
    requestId: string;
    decisionRunId?: string;
    authorityResponseHash?: string;
    hasAuthorityArtifact: boolean;
  }> = [];
  const decisionRunIds = new Set<string>();
  const authorityHashes = new Set<string>();
  let artifactCount = 0;

  for (const id of instanceIds) {
    const inst = scoped.find((i) => i.instanceId === id);
    const p = path.join(instanceArtifactDir(benchmarkRunId, id), 'authority-response.json');
    const hasAuthorityArtifact = await artifactExists(p);
    if (hasAuthorityArtifact) artifactCount += 1;

    let authorityResponseHash = inst?.authorityResponseHash ?? undefined;
    if (!authorityResponseHash && hasAuthorityArtifact) {
      const content = await readArtifact<unknown>(p);
      if (content !== undefined) authorityResponseHash = hashJson(content);
    }
    if (authorityResponseHash) authorityHashes.add(authorityResponseHash);

    const decisionRunId =
      inst?.decisionRunId ?? (hasAuthorityArtifact ? inst?.requestId : undefined);
    if (decisionRunId) decisionRunIds.add(decisionRunId);

    byInstance.push({
      instanceId: id,
      requestId: inst?.requestId ?? '',
      decisionRunId,
      authorityResponseHash,
      hasAuthorityArtifact,
    });
  }

  return {
    artifactCount,
    decisionRunIdCount: decisionRunIds.size,
    decisionRunIds: [...decisionRunIds],
    stableRequestIdCount: scoped.length,
    requestIds: scoped.map((i) => i.requestId),
    authorityResponseHashCount: authorityHashes.size,
    authorityResponseHashes: [...authorityHashes],
    byInstance,
  };
}

function spawnBatchRunner(input: {
  baseUrl: string;
  benchmarkRunId?: string;
  resume?: string;
  env?: NodeJS.ProcessEnv;
}): {
  promise: Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string }>;
  interrupt: (signal?: NodeJS.Signals) => void;
} {
  let childRef: ReturnType<typeof spawn> | undefined;

  const promise = new Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string }>(
    (resolve, reject) => {
      const args = ['tsx', BATCH_SCRIPT, input.baseUrl, '--smoke-calibration', '--concurrency', '1'];
      if (input.resume) {
        args.push('--resume', input.resume);
      } else if (input.benchmarkRunId) {
        args.push('--benchmark-run-id', input.benchmarkRunId);
      }

      let stdout = '';
      const child = spawn('npx', args, {
        cwd: process.cwd(),
        env: { ...process.env, ...input.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      childRef = child;
      child.stdout.on('data', (d) => {
        const s = d.toString();
        stdout += s;
        process.stdout.write(s);
      });
      child.stderr.on('data', (d) => process.stderr.write(d.toString()));

      child.on('error', reject);
      child.on('close', (code, signal) => resolve({ code, signal, stdout }));
    },
  );

  return {
    promise,
    interrupt: (signal = 'SIGINT') => {
      if (childRef && !childRef.killed) {
        childRef.kill(signal);
      }
    },
  };
}

async function waitForInterruptCondition(input: {
  store: BenchmarkRunStore;
  benchmarkRunId: string;
  stage: CalibrationSmokeInterruptStage;
  targetInstanceId: string;
}): Promise<void> {
  const deadline = Date.now() + 300_000;
  while (Date.now() < deadline) {
    const instances = await input.store.listInstances(input.benchmarkRunId);
    const first = instances.find((i) => i.instanceId === 'E1-CAL-01-SAME-WINNER');
    const target = instances.find((i) => i.instanceId === input.targetInstanceId);

    if (input.stage === 'after-authority-artifact') {
      const firstDone = first && first.status === 'COMPLETED';
      const artifactPath = path.join(
        instanceArtifactDir(input.benchmarkRunId, input.targetInstanceId),
        'authority-response.json',
      );
      const hasArtifact = await artifactExists(artifactPath);
      const dbNotAdvanced =
        target &&
        !['AUTHORITY_COMPLETED', 'SHADOW_COMPLETED', 'REVIEW_MATERIALIZED', 'COMPLETED', 'EXCLUDED'].includes(
          target.status,
        );
      if (firstDone && hasArtifact && dbNotAdvanced) return;
    }

    if (input.stage === 'after-shadow-artifact') {
      const shadowPath = path.join(
        instanceArtifactDir(input.benchmarkRunId, input.targetInstanceId),
        'shadow-event.json',
      );
      if (await artifactExists(shadowPath)) return;
    }

    if (input.stage === 'after-materialize') {
      const matPath = path.join(
        instanceArtifactDir(input.benchmarkRunId, input.targetInstanceId),
        'materialize-result.json',
      );
      if (await artifactExists(matPath)) return;
    }

    await sleep(200);
  }
  throw new Error(`interrupt condition not met within timeout (${input.stage})`);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  const store = new BenchmarkRunStore(prisma);

  let benchmarkRunId = opts.resumeOnly ?? newBenchmarkRunId();
  let preflight: PreflightReport | undefined;
  const reportsDir = () => path.join(runArtifactRoot(benchmarkRunId), 'reports');

  if (!opts.resumeOnly) {
    log('Running preflight (hard gate)...');
    preflight = await runCalibrationSmokePreflight({
      baseUrl: opts.baseUrl,
      prisma,
      skipFaultInjectionGate: opts.skipFaultInjectionGate,
    });
    await writeJson(path.join(reportsDir(), 'preflight-report.json'), preflight);

    if (!preflight.passed) {
      log('Preflight FAILED:');
      for (const e of preflight.errors) {
        log(`  ${e.code}: ${e.message}`);
      }
      process.exit(1);
    }
    log('Preflight PASSED');
  }

  if (!validateTransitionGuardSamples()) {
    throw new Error('transition guard sanity check failed');
  }

  const instanceIds = [
    'E1-CAL-01-SAME-WINNER',
    'E1-CAL-02-DIFF-WINNER',
    'E1-CAL-03-REAL-MULTI',
  ];

  let authorityBefore:
    | Awaited<ReturnType<typeof collectAuthorityMetrics>>
    | undefined;
  let interruptionReport: Record<string, unknown> = { skipped: true };

  if (!opts.resumeOnly) {
    const runnerEnv: NodeJS.ProcessEnv = {};
    const abortFile = path.join(runArtifactRoot(benchmarkRunId), '.abort-request');
    runnerEnv.BENCHMARK_SMOKE_ABORT_FILE = abortFile;
    if (!opts.skipInterrupt && opts.interruptAfter === 'after-authority-artifact') {
      runnerEnv.BENCHMARK_SMOKE_HOLD_AFTER_AUTHORITY_ARTIFACT_MS = String(SMOKE_HOLD_MS);
      runnerEnv.BENCHMARK_SMOKE_HOLD_FOR_INSTANCE_ID = CALIBRATION_SMOKE_INTERRUPT_TARGET;
    }

    log(`Starting production runner (runId=${benchmarkRunId})...`);
    const runner = spawnBatchRunner({
      baseUrl: opts.baseUrl,
      benchmarkRunId,
      env: runnerEnv,
    });

    let result: { code: number | null; signal: NodeJS.Signals | null; stdout: string };

    if (!opts.skipInterrupt && opts.interruptAfter !== 'none') {
      await sleep(2_000);
      await waitForInterruptCondition({
        store,
        benchmarkRunId,
        stage: opts.interruptAfter,
        targetInstanceId: CALIBRATION_SMOKE_INTERRUPT_TARGET,
      });
      authorityBefore = await collectAuthorityMetrics(store, benchmarkRunId, instanceIds);
      log(`Interrupt condition met (${opts.interruptAfter}) — abort hold + SIGINT runner`);
      await fs.writeFile(abortFile, `${new Date().toISOString()} abort\n`, 'utf8');
      runner.interrupt('SIGINT');
      result = await runner.promise;

      const runMid = await store.getRun(benchmarkRunId);
      if (runMid?.status !== 'PAUSED') {
        log(`Warning: expected PAUSED after SIGINT, got ${runMid?.status}`);
      }

      interruptionReport = {
        stage: opts.interruptAfter.toUpperCase(),
        runPaused: runMid?.status === 'PAUSED',
        authorityMetricsBefore: authorityBefore,
        benchmarkRunId,
        runnerExitCode: result.code,
        runnerSignal: result.signal,
      };
      await writeJson(path.join(reportsDir(), 'interruption-report.json'), interruptionReport);

      log('Resuming via production runner --resume...');
      const resumeRunner = spawnBatchRunner({
        baseUrl: opts.baseUrl,
        resume: benchmarkRunId,
      });
      result = await resumeRunner.promise;

      const authorityAfter = await collectAuthorityMetrics(store, benchmarkRunId, instanceIds);
      interruptionReport = {
        ...interruptionReport,
        authorityMetricsAfterResume: authorityAfter,
        authorityRequestsAddedOnResume: Math.max(
          0,
          authorityAfter.decisionRunIdCount - authorityBefore.decisionRunIdCount,
        ),
        authorityArtifactsAddedOnResume: Math.max(
          0,
          authorityAfter.artifactCount - authorityBefore.artifactCount,
        ),
      };
      await writeJson(path.join(reportsDir(), 'resume-report.json'), interruptionReport);
    } else {
      result = await runner.promise;
      if (result.code !== 0) {
        throw new Error(`runner exited with code ${result.code} signal ${result.signal}`);
      }
    }

    if (result.stdout.includes('BENCHMARK_RUN_ID=')) {
      const m = result.stdout.match(/BENCHMARK_RUN_ID=(\S+)/);
      if (m) benchmarkRunId = m[1];
    }
  } else {
    log(`Resume-only mode for ${benchmarkRunId}`);
    const resumeRunner = spawnBatchRunner({
      baseUrl: opts.baseUrl,
      resume: benchmarkRunId,
    });
    const resumeResult = await resumeRunner.promise;
    if (resumeResult.code !== 0) {
      throw new Error(`resume runner exited with code ${resumeResult.code}`);
    }
  }

  await store.aggregateRunCounters(benchmarkRunId);
  const run = await store.getRun(benchmarkRunId);
  const instances = await store.listInstances(benchmarkRunId);
  if (!run) throw new Error(`run missing: ${benchmarkRunId}`);

  const reconciliation = await reconcileSmokeEvidence({ prisma, run, instances });
  await writeJson(path.join(reportsDir(), 'evidence-reconciliation.json'), reconciliation);

  const acceptanceFailures = assertSmokeRunAcceptance({
    run,
    instances,
    reconciliation,
    authorityMetricsBefore: interruptionReport.authorityMetricsBefore as
      | Awaited<ReturnType<typeof collectAuthorityMetrics>>
      | undefined,
    authorityMetricsAfter: interruptionReport.authorityMetricsAfterResume as
      | Awaited<ReturnType<typeof collectAuthorityMetrics>>
      | undefined,
  });

  if (
    !opts.skipInterrupt &&
    opts.interruptAfter !== 'none' &&
    interruptionReport.runPaused === false
  ) {
    acceptanceFailures.push('expected PAUSED after SIGINT interrupt');
  }

  const completed = instances.filter((i) => i.status === 'COMPLETED').length;
  const reviewExcluded = instances.filter((i) => deriveReviewDisposition(i) === 'EXCLUDED').length;
  const reviewMaterialized = instances.filter((i) => deriveReviewDisposition(i) === 'MATERIALIZED').length;
  const failed = instances.filter((i) => i.status === 'TERMINAL_FAILED').length;

  const summary = {
    passed: acceptanceFailures.length === 0 && reconciliation.passed,
    benchmarkRunId,
    preflight: preflight
      ? {
          migration: preflight.migration.deployed,
          schema: preflight.schema.tables && preflight.schema.leaseColumns,
          persistence: preflight.persistenceProbe.passed,
          runtimeMode: preflight.runtime?.runtimeMode === 'SHADOW',
          faultInjectionGate: preflight.faultInjectionGate,
        }
      : { skipped: true },
    interruption: interruptionReport,
    instances: { total: 3, completed, reviewExcluded, reviewMaterialized, failed },
    duplicates: reconciliation.duplicates,
    activeLeases: reconciliation.activeLeases,
    acceptanceFailures,
    frozen: preflight?.frozen,
  };

  await writeJson(path.join(reportsDir(), 'calibration-smoke-summary.json'), summary);

  const md = [
    '# E1 Calibration Smoke Summary',
    '',
    `- **passed**: ${summary.passed}`,
    `- **benchmarkRunId**: \`${benchmarkRunId}\``,
    `- **run status**: ${run.status}`,
    `- **instances**: completed=${completed} reviewExcluded=${reviewExcluded} reviewMaterialized=${reviewMaterialized} failed=${failed}`,
    `- **active leases**: ${reconciliation.activeLeases}`,
    `- **hash mismatches**: ${reconciliation.hashMismatches}`,
    '',
    acceptanceFailures.length
      ? `## Failures\n${acceptanceFailures.map((f) => `- ${f}`).join('\n')}`
      : '## All acceptance checks passed',
  ].join('\n');
  await fs.writeFile(path.join(reportsDir(), 'calibration-smoke-summary.md'), md);

  log(`Summary → ${path.join(reportsDir(), 'calibration-smoke-summary.md')}`);

  if (!summary.passed) {
    for (const f of acceptanceFailures) log(`FAIL: ${f}`);
    process.exit(1);
  }

  log('E1 Calibration smoke PASSED');
  await prisma.$disconnect();
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
