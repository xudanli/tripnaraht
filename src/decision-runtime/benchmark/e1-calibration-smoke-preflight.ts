/**
 * Task E1.2 — Hard preflight gates for Calibration Staging smoke.
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import {
  buildRunConfig,
  hashDataset,
  hashRunConfig,
  resolveEnvironmentHash,
  resolveGitCommit,
  CONSTRAINT_POLICY_VERSION,
} from './benchmark-config.util';
import { buildCalibrationSmokeDataset } from './benchmark-calibration-smoke';
import { OBJECTIVE_REGISTRY_VERSION } from '../objectives/objective-semantics.registry';
import { getBenchmarkArtifactRoot, hashArtifactFile } from './benchmark-artifact.util';
import { buildTaskDScenarios } from '../../decision-lab/e2e/task-d-scenarios.fixture';
import { icelandMinimalWorldState } from '../../decision-lab/fixtures/iceland-minimal.fixture';
import {
  readFaultInjectionGate,
  validateFaultInjectionGate,
  FAULT_INJECTION_EXPECTED,
} from './benchmark-fault-injection-gate.util';

const REQUIRED_MIGRATIONS = [
  '20260701160000_shadow_review_evidence',
  '20260701170000_benchmark_batch_runner',
] as const;

const PREFLIGHT_EXPERIMENT_ID = 'E1_CALIBRATION_SMOKE_PREFLIGHT';

export type PreflightErrorCode =
  | 'API_HEALTH_FAILED'
  | 'RUNTIME_DIAGNOSTICS_FAILED'
  | 'RUNTIME_MODE_INVALID'
  | 'CANONICAL_FULL_PLAN_SELECTION_DISABLED'
  | 'CANONICAL_EXECUTION_ENABLED'
  | 'SHADOW_PERSISTENCE_DISABLED'
  | 'BLINDING_KEY_NOT_CONFIGURED'
  | 'E1_MIGRATION_NOT_DEPLOYED'
  | 'E1_SCHEMA_TABLE_MISSING'
  | 'E1_LEASE_COLUMNS_MISSING'
  | 'E1_UNIQUE_CONSTRAINT_MISSING'
  | 'E0_PERSISTENCE_PROBE_FAILED'
  | 'FAULT_INJECTION_GATE_FAILED'
  | 'ACTIVE_RUNNER_CONFLICT'
  | 'ARTIFACT_DIR_NOT_WRITABLE'
  | 'ARTIFACT_ATOMIC_RENAME_FAILED'
  | 'INSUFFICIENT_DISK_SPACE'
  | 'BENCHMARK_RUN_ID_COLLISION';

export interface RuntimeDiagnosticsPayload {
  environment: string;
  gitCommit: string;
  schemaVersion: string;
  runtimeMode: string;
  canonicalFullPlanSelection: boolean;
  canonicalExecutionEnabled: boolean;
  shadowEvidencePersistenceEnabled: boolean;
  blindingEncryptionKeyConfigured: boolean;
  solverEngine: string;
  objectiveRegistryVersion: string;
  constraintPolicyVersion: string;
}

export interface PreflightReport {
  passed: boolean;
  checkedAt: string;
  baseUrl: string;
  errors: Array<{ code: PreflightErrorCode; message: string }>;
  migration: {
    deployed: boolean;
    migrations: string[];
  };
  schema: {
    tables: boolean;
    uniqueConstraints: boolean;
    leaseColumns: boolean;
    indexes: boolean;
  };
  runtime: RuntimeDiagnosticsPayload | null;
  persistenceProbe: {
    passed: boolean;
    comparisonId?: string;
    reviewCaseId?: string;
  };
  faultInjectionGate: {
    required: boolean;
    passed: boolean;
    passedCount?: number;
    skippedCount?: number;
    failedCount?: number;
    gitCommit?: string;
    executedAt?: string;
  };
  frozen: {
    gitCommit: string;
    environmentHash: string;
    datasetChecksum: string;
    configHash: string;
    objectiveRegistryVersion: string;
    constraintPolicyVersion: string;
    solverEngine: string;
    nodeVersion: string;
  };
  artifact: {
    root: string;
    writable: boolean;
    atomicRename: boolean;
    freeBytesEstimate: number;
  };
}

type ApiResponse<T> = { success: boolean; data?: T; error?: { message?: string } };

async function api<T>(baseUrl: string, urlPath: string): Promise<{ status: number; json: ApiResponse<T> }> {
  const headers: Record<string, string> = {};
  const token = process.env.BENCHMARK_PREFLIGHT_TOKEN?.trim();
  if (token) headers['X-Benchmark-Preflight-Token'] = token;

  const res = await fetch(`${baseUrl}${urlPath}`, { headers });
  let json: ApiResponse<T>;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    json = { success: false, error: { message: `Non-JSON (${res.status})` } };
  }
  return { status: res.status, json };
}

export async function runCalibrationSmokePreflight(input: {
  baseUrl: string;
  prisma: PrismaClient;
  skipFaultInjectionGate?: boolean;
  minFreeBytes?: number;
}): Promise<PreflightReport> {
  const errors: PreflightReport['errors'] = [];
  const push = (code: PreflightErrorCode, message: string) => errors.push({ code, message });

  const dataset = buildCalibrationSmokeDataset();
  const config = buildRunConfig({
    dataset,
    split: 'CALIBRATION',
    baseUrl: input.baseUrl,
    concurrency: 1,
    maxAttempts: 3,
    shadowWaitTimeoutMs: 120_000,
  });

  const frozen = {
    gitCommit: resolveGitCommit(),
    environmentHash: resolveEnvironmentHash(),
    datasetChecksum: hashDataset(dataset),
    configHash: hashRunConfig(config),
    objectiveRegistryVersion: OBJECTIVE_REGISTRY_VERSION,
    constraintPolicyVersion: CONSTRAINT_POLICY_VERSION,
    solverEngine: config.solverEngine,
    nodeVersion: process.version,
  };

  // --- API health ---
  const health = await api<{ status: string }>(input.baseUrl, '/decision-engine/v1/health');
  if (health.status !== 200 || !health.json.success) {
    push('API_HEALTH_FAILED', `health status=${health.status}`);
  }

  // --- Runtime diagnostics (live app config) ---
  let runtime: RuntimeDiagnosticsPayload | null = null;
  const diag = await api<RuntimeDiagnosticsPayload>(
    input.baseUrl,
    '/decision-engine/v1/runtime-diagnostics',
  );
  if (diag.status !== 200 || !diag.json.success || !diag.json.data) {
    push('RUNTIME_DIAGNOSTICS_FAILED', `runtime-diagnostics status=${diag.status}`);
  } else {
    runtime = diag.json.data;
    if (runtime.runtimeMode !== 'SHADOW') {
      push('RUNTIME_MODE_INVALID', `expected SHADOW got ${runtime.runtimeMode}`);
    }
    if (!runtime.canonicalFullPlanSelection) {
      push('CANONICAL_FULL_PLAN_SELECTION_DISABLED', 'canonicalFullPlanSelection must be true');
    }
    if (runtime.canonicalExecutionEnabled) {
      push('CANONICAL_EXECUTION_ENABLED', 'canonicalExecutionEnabled must be false');
    }
    if (!runtime.shadowEvidencePersistenceEnabled) {
      push('SHADOW_PERSISTENCE_DISABLED', 'shadowEvidencePersistenceEnabled must be true');
    }
    if (!runtime.blindingEncryptionKeyConfigured) {
      push('BLINDING_KEY_NOT_CONFIGURED', 'blindingEncryptionKeyConfigured must be true');
    }
  }

  // --- Migrations ---
  const migrationRows = await input.prisma.$queryRaw<Array<{ migration_name: string }>>`
    SELECT migration_name FROM _prisma_migrations
    WHERE migration_name IN (
      '20260701160000_shadow_review_evidence',
      '20260701170000_benchmark_batch_runner'
    )
  `;
  const deployedNames = migrationRows.map((r) => r.migration_name);
  const migrationOk = REQUIRED_MIGRATIONS.every((m) => deployedNames.includes(m));
  if (!migrationOk) {
    push(
      'E1_MIGRATION_NOT_DEPLOYED',
      `missing migrations: ${REQUIRED_MIGRATIONS.filter((m) => !deployedNames.includes(m)).join(', ')}`,
    );
  }

  // --- Schema ---
  let schema = { tables: false, uniqueConstraints: false, leaseColumns: false, indexes: false };
  if (migrationOk) {
    schema = await verifyBenchmarkSchema(input.prisma, push);
  }

  // --- E0 persistence probe (ephemeral) ---
  const persistenceProbe = await runPersistenceProbe(input.baseUrl, push);

  // --- Fault injection gate ---
  const faultInjectionGate: {
    required: boolean;
    passed: boolean;
    failedCount: number;
    skippedCount: number;
    passedCount?: number;
    gitCommit?: string;
    executedAt?: string;
  } = {
    required: !input.skipFaultInjectionGate,
    passed: true,
    failedCount: 0,
    skippedCount: 0,
  };
  if (!input.skipFaultInjectionGate && migrationOk) {
    const gate = await runFaultInjectionGate();
    faultInjectionGate.passed = gate.passed;
    faultInjectionGate.passedCount = gate.passedCount;
    faultInjectionGate.skippedCount = gate.skippedCount;
    faultInjectionGate.failedCount = gate.failedCount;
    faultInjectionGate.gitCommit = gate.gitCommit;
    faultInjectionGate.executedAt = gate.executedAt;
    if (!gate.passed) {
      push(
        'FAULT_INJECTION_GATE_FAILED',
        `fault injection must be 29/29 real PASS (passed=${gate.passedCount} skipped=${gate.skippedCount} failed=${gate.failedCount})`,
      );
    }
  }

  // --- Active runner conflict ---
  const active = await input.prisma.decisionBenchmarkInstanceExecution.count({
    where: {
      lockedBy: { not: null },
      leaseExpiresAt: { gt: new Date() },
      status: { notIn: ['COMPLETED', 'EXCLUDED', 'TERMINAL_FAILED'] },
    },
  });
  if (active > 0) {
    push('ACTIVE_RUNNER_CONFLICT', `${active} instance(s) hold active leases`);
  }

  // --- Artifact directory ---
  const artifact = await verifyArtifactRoot(input.minFreeBytes ?? 50 * 1024 * 1024, push);

  const passed = errors.length === 0;
  return {
    passed,
    checkedAt: new Date().toISOString(),
    baseUrl: input.baseUrl,
    errors,
    migration: { deployed: migrationOk, migrations: deployedNames },
    schema,
    runtime,
    persistenceProbe,
    faultInjectionGate,
    frozen,
    artifact,
  };
}

async function verifyBenchmarkSchema(
  prisma: PrismaClient,
  push: (code: PreflightErrorCode, message: string) => void,
): Promise<PreflightReport['schema']> {
  const tables = await prisma.$queryRaw<Array<{ table_name: string }>>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('decision_benchmark_run', 'decision_benchmark_instance_execution')
  `;
  const tableNames = new Set(tables.map((t) => t.table_name));
  const tablesOk =
    tableNames.has('decision_benchmark_run') &&
    tableNames.has('decision_benchmark_instance_execution');
  if (!tablesOk) {
    push('E1_SCHEMA_TABLE_MISSING', 'benchmark tables not found');
  }

  const cols = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'decision_benchmark_instance_execution'
      AND column_name IN ('lease_expires_at', 'locked_by', 'heartbeat_at', 'request_id', 'status')
  `;
  const colSet = new Set(cols.map((c) => c.column_name));
  const leaseOk =
    colSet.has('lease_expires_at') &&
    colSet.has('locked_by') &&
    colSet.has('heartbeat_at');
  if (!leaseOk) {
    push('E1_LEASE_COLUMNS_MISSING', 'lease columns missing on instance execution table');
  }

  const uniques = await prisma.$queryRaw<Array<{ indexname: string; indexdef: string }>>`
    SELECT indexname, indexdef FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'decision_benchmark_instance_execution'
  `;
  const indexText = uniques.map((u) => u.indexdef).join('\n');
  const uniqueOk =
    indexText.includes('request_id') &&
    (indexText.includes('benchmark_run_id') || indexText.includes('benchmark_run_id, instance_id'));
  if (!uniqueOk) {
    push('E1_UNIQUE_CONSTRAINT_MISSING', 'request_id or run+instance unique index missing');
  }

  const shadowUniques = await prisma.$queryRaw<Array<{ indexname: string }>>`
    SELECT indexname FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename IN (
        'decision_shadow_comparison',
        'decision_shadow_review_case',
        'decision_shadow_review_submission'
      )
  `;
  const indexesOk = shadowUniques.length >= 3;

  return {
    tables: tablesOk,
    uniqueConstraints: uniqueOk && indexesOk,
    leaseColumns: leaseOk,
    indexes: indexesOk,
  };
}

async function runPersistenceProbe(
  baseUrl: string,
  push: (code: PreflightErrorCode, message: string) => void,
): Promise<PreflightReport['persistenceProbe']> {
  try {
    const tripId = `preflight_${Date.now()}`;
    const runId = `preflight_${PREFLIGHT_EXPERIMENT_ID}_${Date.now()}`;
    const scenario = buildTaskDScenarios().find((s) => s.id === 'TD-001-single-candidate');
    const worldState = icelandMinimalWorldState();
    const res = await fetch(`${baseUrl}/decision-engine/v1/canonical-plan-selection`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Decision-Experiment-Id': PREFLIGHT_EXPERIMENT_ID,
        'X-Decision-Run-Id': runId,
        'X-Decision-Source': 'E1_CALIBRATION_SMOKE_PREFLIGHT',
      },
      body: JSON.stringify({
        tripId,
        state: worldState,
        problemId: runId,
        prebuiltCandidates: scenario?.candidates ?? [],
        constraintReportsByCandidateId: scenario?.constraintReports ?? {},
      }),
    });
    if (res.status >= 500) {
      push('E0_PERSISTENCE_PROBE_FAILED', `canonical-plan-selection preflight HTTP ${res.status}`);
      return { passed: false };
    }

    const list = await api<{ events: Array<{ comparisonId: string }> }>(
      baseUrl,
      `/decision-engine/v1/shadow-observability/events?decisionRunId=${encodeURIComponent(runId)}&limit=1`,
    );
    const comparisonId = list.json.data?.events?.[0]?.comparisonId;
    if (!comparisonId) {
      push('E0_PERSISTENCE_PROBE_FAILED', 'no shadow event for preflight probe');
      return { passed: false };
    }

    const mat = await fetch(`${baseUrl}/decision-engine/v1/shadow-reviews/materialize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ comparisonIds: [comparisonId] }),
    });
    const matJson = (await mat.json()) as ApiResponse<{
      materialized?: Array<{ reviewCaseId: string }>;
      alreadyExists?: number;
    }>;
    if (!matJson.success) {
      push('E0_PERSISTENCE_PROBE_FAILED', 'materialize failed on preflight probe');
      return { passed: false, comparisonId };
    }

    const stats = await api<unknown>(baseUrl, '/decision-engine/v1/shadow-reviews/stats');
    if (stats.status !== 200 || !stats.json.success) {
      push('E0_PERSISTENCE_PROBE_FAILED', 'shadow-reviews/stats failed (decrypt/key issue?)');
      return { passed: false, comparisonId };
    }

    const reviewCaseId =
      matJson.data?.materialized?.[0]?.reviewCaseId ??
      (matJson.data?.alreadyExists ? undefined : undefined);

    return { passed: true, comparisonId, reviewCaseId };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    push('E0_PERSISTENCE_PROBE_FAILED', message);
    return { passed: false };
  }
}

async function runFaultInjectionGate(): Promise<{
  passed: boolean;
  passedCount: number;
  skippedCount: number;
  failedCount: number;
  gitCommit?: string;
  executedAt?: string;
}> {
  const existing = await readFaultInjectionGate();
  if (existing) {
    const validation = validateFaultInjectionGate({ gate: existing });
    if (validation.valid) {
      return {
        passed: true,
        passedCount: existing.passed,
        skippedCount: 0,
        failedCount: 0,
        gitCommit: existing.gitCommit,
        executedAt: existing.executedAt,
      };
    }
  }

  const outFile = path.join(getBenchmarkArtifactRoot(), '.fault-injection-jest.json');
  try {
    execSync(
      `BENCHMARK_INTEGRATION_TEST=1 npm run test:benchmark-fault-injection -- --json --outputFile=${outFile}`,
      { encoding: 'utf8', stdio: 'pipe', maxBuffer: 10 * 1024 * 1024 },
    );
  } catch {
    return { passed: false, passedCount: 0, skippedCount: FAULT_INJECTION_EXPECTED, failedCount: 0 };
  }

  const gate = await readFaultInjectionGate();
  if (!gate) {
    return { passed: false, passedCount: 0, skippedCount: FAULT_INJECTION_EXPECTED, failedCount: 0 };
  }

  const validation = validateFaultInjectionGate({ gate });
  return {
    passed: validation.valid,
    passedCount: gate.passed,
    skippedCount: gate.skipped,
    failedCount: gate.failed,
    gitCommit: gate.gitCommit,
    executedAt: gate.executedAt,
  };
}

async function verifyArtifactRoot(
  minFreeBytes: number,
  push: (code: PreflightErrorCode, message: string) => void,
): Promise<PreflightReport['artifact']> {
  const root = getBenchmarkArtifactRoot();
  let writable = false;
  let atomicRename = false;
  let freeBytesEstimate = 0;

  try {
    await fs.mkdir(root, { recursive: true });
    const probeDir = path.join(root, `.preflight_${Date.now()}`);
    await fs.mkdir(probeDir, { recursive: true });
    const tmp = path.join(probeDir, 'partial.json');
    const final = path.join(probeDir, 'final.json');
    await fs.writeFile(tmp, '{"probe":true}\n');
    await fs.rename(tmp, final);
    atomicRename = true;
    await hashArtifactFile(final);
    writable = true;
    await fs.rm(probeDir, { recursive: true, force: true });

    const stats = await fs.statfs(root).catch(() => null);
    if (stats && 'bfree' in stats && 'bsize' in stats) {
      freeBytesEstimate = Number(stats.bfree) * Number(stats.bsize);
    } else {
      freeBytesEstimate = minFreeBytes;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    push('ARTIFACT_DIR_NOT_WRITABLE', message);
  }

  if (!atomicRename) {
    push('ARTIFACT_ATOMIC_RENAME_FAILED', 'atomic rename probe failed');
  }
  if (freeBytesEstimate > 0 && freeBytesEstimate < minFreeBytes) {
    push('INSUFFICIENT_DISK_SPACE', `free bytes ${freeBytesEstimate} < ${minFreeBytes}`);
  }

  return { root, writable, atomicRename, freeBytesEstimate };
}

export async function assertNoRunIdCollision(
  prisma: PrismaClient,
  benchmarkRunId: string,
  push: (code: PreflightErrorCode, message: string) => void,
): Promise<void> {
  const existing = await prisma.decisionBenchmarkRun.findUnique({
    where: { benchmarkRunId },
  });
  if (existing) {
    push('BENCHMARK_RUN_ID_COLLISION', `run id already exists: ${benchmarkRunId}`);
  }
}

export { PREFLIGHT_EXPERIMENT_ID };
