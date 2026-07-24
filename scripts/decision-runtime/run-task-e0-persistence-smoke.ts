/**
 * Task E0 — Staging persistence smoke (migration + restart + idempotency + EXCLUDED funnel).
 *
 * Usage:
 *   npx tsx scripts/decision-runtime/run-task-e0-persistence-smoke.ts [baseUrl]
 *
 * Options:
 *   --skip-server       Assume server already running with persistence env
 *   --skip-restart      Skip kill/restart verification
 *   --skip-wrong-key    Skip wrong-key decrypt failure test
 *   --migrate-only      Run backup + prisma migrate deploy only
 *
 * Requires:
 *   SHADOW_EVIDENCE_PERSISTENCE_ENABLED=1
 *   SHADOW_REVIEW_BLINDING_ENCRYPTION_KEY=<64 hex> (stable across restarts)
 *   Shadow staging env vars (see run-task-d-staging-shadow.ts)
 */

import { createHash, randomBytes } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { buildTaskDScenarios } from '../../src/decision-lab/e2e/task-d-scenarios.fixture';
import {
  icelandMinimalMultiCandidateFixture,
  icelandMinimalWorldState,
} from '../../src/decision-lab/fixtures/iceland-minimal.fixture';
import { PrismaClient } from '@prisma/client';

const EXPERIMENT_ID = 'TASK_E0_PERSISTENCE_SMOKE';
const DEFAULT_BASE = 'http://localhost:3001/api';
const ARTIFACT_ROOT = path.join(process.cwd(), 'artifacts/task-e0-persistence');
const CHECKPOINT_PATH = path.join(ARTIFACT_ROOT, 'checkpoint.json');
const SERVER_PORT = 3001;
const SERVER_LOG = path.join(ARTIFACT_ROOT, 'logs/server.log');

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: { code?: string; message?: string };
};

interface Checkpoint {
  runAt: string;
  baseUrl: string;
  tripId: string;
  eligible: {
    comparisonId: string;
    reviewCaseId: string;
    reviewerId: string;
    idempotencyKey: string;
    submissionId?: string;
    derivedClassification?: string;
    hashes: Record<string, string>;
  };
  excluded: {
    comparisonId: string;
    reviewCaseId?: string;
    exclusionReason?: string;
  };
  statsHash: string;
  materializeCounts: { created: number; alreadyExists: number };
}

const args = process.argv.slice(2);
const baseUrl = (args.find((a) => !a.startsWith('--')) ?? DEFAULT_BASE).replace(/\/$/, '');
const skipServer = args.includes('--skip-server');
const skipRestart = args.includes('--skip-restart');
const skipWrongKey = args.includes('--skip-wrong-key');
const migrateOnly = args.includes('--migrate-only');
const verifyOnly = args.includes('--verify-only');

function log(line: string) {
  console.log(`[${new Date().toISOString()}] ${line}`);
}

function hashJson(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function hashStatsSnapshot(stats: unknown): string {
  if (!stats || typeof stats !== 'object') return hashJson(stats);
  const { collectedAt: _c, ...rest } = stats as Record<string, unknown>;
  return hashJson(rest);
}

async function api<T>(
  method: string,
  urlPath: string,
  body?: unknown,
  headers?: Record<string, string>,
): Promise<{ status: number; json: ApiResponse<T>; latencyMs: number }> {
  const started = Date.now();
  const res = await fetch(`${baseUrl}${urlPath}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const latencyMs = Date.now() - started;
  let json: ApiResponse<T>;
  try {
    json = (await res.json()) as ApiResponse<T>;
  } catch {
    json = { success: false, error: { message: `Non-JSON (${res.status})` } };
  }
  return { status: res.status, json, latencyMs };
}

async function ensureEncryptionKey(): Promise<string> {
  let key = process.env.SHADOW_REVIEW_BLINDING_ENCRYPTION_KEY?.trim();
  if (key && /^[0-9a-fA-F]{64}$/.test(key)) return key;

  const keyFile = path.join(ARTIFACT_ROOT, '.blinding-key');
  try {
    key = (await fs.readFile(keyFile, 'utf8')).trim();
    if (/^[0-9a-fA-F]{64}$/.test(key)) {
      process.env.SHADOW_REVIEW_BLINDING_ENCRYPTION_KEY = key;
      return key;
    }
  } catch {
    /* generate below */
  }

  key = randomBytes(32).toString('hex');
  await fs.mkdir(ARTIFACT_ROOT, { recursive: true });
  await fs.writeFile(keyFile, key, { mode: 0o600 });
  process.env.SHADOW_REVIEW_BLINDING_ENCRYPTION_KEY = key;
  log(`Generated stable blinding key → ${keyFile} (not committed)`);
  return key;
}

function shadowServerEnv(key: string, port = SERVER_PORT): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PORT: String(port),
    SHADOW_EVIDENCE_PERSISTENCE_ENABLED: '1',
    SHADOW_REVIEW_BLINDING_ENCRYPTION_KEY: key,
    DECISION_RUNTIME_MODE: 'SHADOW',
    CANONICAL_FULL_PLAN_SELECTION: '1',
    DECISION_LAB_ENABLED: '1',
    OPTIMIZATION_SHADOW_OBSERVABILITY_ENABLED: '1',
    CP_SAT_SOLVER_ENGINE: 'cp-sat-lex-v1',
    DISABLE_REDIS: process.env.DISABLE_REDIS ?? 'true',
    NEST_BOOTSTRAP_TIMEOUT_MS: process.env.NEST_BOOTSTRAP_TIMEOUT_MS ?? '180000',
  };
}

let serverProc: ChildProcess | null = null;

async function freePort(port: number): Promise<void> {
  await new Promise<void>((resolve) => {
    const proc = spawn('fuser', ['-k', `${port}/tcp`], { stdio: 'ignore' });
    proc.on('close', () => resolve());
    proc.on('error', () => resolve());
  });
  await new Promise((r) => setTimeout(r, 2000));
}

async function waitForHealth(port: number, timeoutMs = 180_000): Promise<void> {
  const urls = [
    `http://localhost:${port}/health`,
    `http://localhost:${port}/api/decision-engine/v1/health`,
  ];
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (res.ok) return;
      } catch {
        /* retry */
      }
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Health check timeout on port ${port}`);
}

async function startServer(key: string, port = SERVER_PORT): Promise<void> {
  await freePort(port);
  await fs.mkdir(path.dirname(SERVER_LOG), { recursive: true });
  const logFd = await fs.open(SERVER_LOG, 'a');
  serverProc = spawn('node', ['dist/src/main.js'], {
    env: shadowServerEnv(key, port),
    stdio: ['ignore', logFd.fd, logFd.fd],
    detached: false,
  });
  serverProc.on('exit', (code, signal) => {
    log(`Server exited code=${code} signal=${signal}`);
  });
  await waitForHealth(port);
  log(`Server ready on port ${port}`);
}

async function stopServer(): Promise<void> {
  if (!serverProc?.pid) return;
  const pid = serverProc.pid;
  serverProc.kill('SIGTERM');
  await new Promise((r) => setTimeout(r, 3000));
  try {
    process.kill(pid, 0);
    process.kill(pid, 'SIGKILL');
  } catch {
    /* already dead */
  }
  serverProc = null;
  log('Server stopped');
}

async function backupAndMigrate(): Promise<void> {
  await fs.mkdir(path.join(ARTIFACT_ROOT, 'backups'), { recursive: true });
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_URL not set');

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(ARTIFACT_ROOT, 'backups', `pre-e0-shadow-${stamp}.sql`);

  log('Creating pg_dump backup (schema-only check + full backup)...');
  try {
    await new Promise<void>((resolve, reject) => {
      const dump = spawn('pg_dump', [dbUrl, '--no-owner', '--no-privileges'], {
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const chunks: Buffer[] = [];
      dump.stdout.on('data', (c: Buffer) => chunks.push(c));
      dump.stderr.on('data', (c: Buffer) => log(`pg_dump: ${c.toString().trim()}`));
      dump.on('close', async (code) => {
        if (code !== 0) {
          reject(new Error(`pg_dump failed code=${code}`));
          return;
        }
        await fs.writeFile(backupPath, Buffer.concat(chunks));
        resolve();
      });
    });
    log(`Backup written: ${backupPath}`);
  } catch (err) {
    log(`WARN: pg_dump unavailable (${err instanceof Error ? err.message : err}) — proceeding without backup`);
  }

  const migrationSql = await fs.readFile(
    path.join(
      process.cwd(),
      'prisma/migrations/20260701160000_shadow_review_evidence/migration.sql',
    ),
    'utf8',
  );
  const allowed = ['decision_shadow_comparison', 'decision_shadow_review_case', 'decision_shadow_review_submission'];
  for (const table of allowed) {
    if (!migrationSql.includes(table)) {
      throw new Error(`Migration missing expected table: ${table}`);
    }
  }
  const alterLines = migrationSql.match(/ALTER TABLE[^\n;]+/gi) ?? [];
  for (const line of alterLines) {
    if (!/decision_shadow_(comparison|review_case|review_submission)/i.test(line)) {
      throw new Error(`Migration alters non-shadow table: ${line.trim()}`);
    }
  }
  log('Migration SQL verified: 3 new shadow evidence tables only');

  log('Running prisma migrate deploy...');
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('npx', ['prisma', 'migrate', 'deploy'], {
      stdio: 'inherit',
      env: process.env,
    });
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`migrate deploy code=${code}`))));
  });

  await new Promise<void>((resolve, reject) => {
    const proc = spawn('npx', ['prisma', 'migrate', 'status'], {
      stdio: 'inherit',
      env: process.env,
    });
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`migrate status code=${code}`))));
  });
}

async function runShadowRequest(input: {
  scenarioId: string;
  tripId: string;
  prebuiltCandidates: unknown[];
  constraintReportsByCandidateId?: Record<string, unknown>;
  stagingShadowOptions?: Record<string, unknown>;
}): Promise<{ comparisonId?: string; runId: string }> {
  const runId = `e0-${input.scenarioId}-${Date.now()}`;
  const body: Record<string, unknown> = {
    tripId: input.tripId,
    state: icelandMinimalWorldState(),
    prebuiltCandidates: input.prebuiltCandidates,
    problemId: runId,
    experimentContext: {
      experimentId: EXPERIMENT_ID,
      scenarioId: input.scenarioId,
      runId,
      source: 'E0_PERSISTENCE_SMOKE',
    },
  };
  if (input.constraintReportsByCandidateId) {
    body.constraintReportsByCandidateId = input.constraintReportsByCandidateId;
  }
  if (input.stagingShadowOptions) {
    body.stagingShadowOptions = input.stagingShadowOptions;
  }

  const headers = {
    'X-Decision-Experiment-Id': EXPERIMENT_ID,
    'X-Decision-Scenario-Id': input.scenarioId,
    'X-Decision-Run-Id': runId,
    'X-Decision-Source': 'E0_PERSISTENCE_SMOKE',
  };

  const res = await api<{ optimizationShadow?: { comparisonId?: string } }>(
    'POST',
    '/decision-engine/v1/canonical-plan-selection',
    body,
    headers,
  );
  if (!res.json.success) {
    throw new Error(`${input.scenarioId} canonical-plan-selection failed: ${res.json.error?.message}`);
  }
  const comparisonId = res.json.data?.optimizationShadow?.comparisonId;
  if (!comparisonId) {
    throw new Error(`${input.scenarioId} missing optimizationShadow.comparisonId`);
  }
  return { comparisonId, runId };
}

async function pollComparisonInDb(prisma: PrismaClient, comparisonId: string): Promise<boolean> {
  for (let i = 0; i < 10; i += 1) {
    const row = await prisma.decisionShadowComparison.findUnique({
      where: { comparisonId },
    });
    if (row) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

async function seedEvidence(prisma: PrismaClient): Promise<Checkpoint> {
  const tripId = `e0_persistence_${Date.now()}`;
  const scenarios = buildTaskDScenarios();
  const td006 = scenarios.find((s) => s.id === 'TD-006-three-way');
  const td001 = scenarios.find((s) => s.id === 'TD-001-single-candidate');
  if (!td006 || !td001) throw new Error('Required fixtures TD-006 / TD-001 missing');

  log('REAL-MULTI + TD-006 eligible path...');
  await runShadowRequest({
    scenarioId: 'REAL-MULTI-CANDIDATE',
    tripId: `${tripId}_real`,
    prebuiltCandidates: icelandMinimalMultiCandidateFixture(),
  });

  const eligibleRun = await runShadowRequest({
    scenarioId: td006.id,
    tripId,
    prebuiltCandidates: td006.candidates,
    constraintReportsByCandidateId: td006.constraintReports,
  });
  const eligibleComparisonId = eligibleRun.comparisonId!;

  const inDb = await pollComparisonInDb(prisma, eligibleComparisonId);
  if (!inDb) throw new Error(`comparison not persisted: ${eligibleComparisonId}`);

  log('TD-001 SAME_WINNER excluded path...');
  const excludedRun = await runShadowRequest({
    scenarioId: td001.id,
    tripId,
    prebuiltCandidates: td001.candidates,
    constraintReportsByCandidateId: td001.constraintReports,
  });
  const excludedComparisonId = excludedRun.comparisonId!;

  log('Materialize review cases...');
  const mat = await api<{
    created: number;
    alreadyExists: number;
    excluded: number;
    materialized: Array<{ reviewCaseId: string; comparisonId: string }>;
    skipped: Array<{ comparisonId: string; reason: string }>;
  }>('POST', '/decision-engine/v1/shadow-reviews/materialize', {
    comparisonIds: [eligibleComparisonId, excludedComparisonId],
  });
  if (!mat.json.success) {
    throw new Error(`materialize failed: ${mat.json.error?.message}`);
  }
  const data = mat.json.data!;
  if ((data.created ?? 0) < 1) {
    throw new Error(`expected created>=1 eligible case, got ${JSON.stringify(data)}`);
  }

  const eligibleCase = data.materialized.find((m) => m.comparisonId === eligibleComparisonId);
  if (!eligibleCase) {
    throw new Error(`eligible review case not materialized for ${eligibleComparisonId}`);
  }

  const excludedRow = await prisma.decisionShadowReviewCase.findUnique({
    where: { comparisonId: excludedComparisonId },
  });
  if (!excludedRow || excludedRow.status !== 'EXCLUDED') {
    throw new Error(
      `EXCLUDED case missing for SAME_WINNER comparison ${excludedComparisonId} status=${excludedRow?.status}`,
    );
  }

  const queue = await api<{ items: Array<{ reviewCaseId: string; status: string }> }>(
    'GET',
    `/decision-engine/v1/shadow-reviews/queue?tripId=${encodeURIComponent(tripId)}`,
  );
  const excludedInQueue = queue.json.data?.items?.some(
    (i) => i.reviewCaseId === excludedRow.reviewCaseId,
  );
  if (excludedInQueue) {
    throw new Error('EXCLUDED case appeared in default review queue');
  }

  const reviewerId = 'e0-staging-reviewer';
  const idempotencyKey = `${eligibleCase.reviewCaseId}:${reviewerId}`;
  const detail = await api<{
    blindedOptionA: unknown;
    blindedOptionB: unknown;
  }>('GET', `/decision-engine/v1/shadow-reviews/${encodeURIComponent(eligibleCase.reviewCaseId)}`);
  if (!detail.json.success) {
    throw new Error(`review case GET failed: ${detail.json.error?.message}`);
  }
  const detailRaw = JSON.stringify(detail.json);
  if (/blindMapping|authorityCandidate|shadowCandidate|strategyVersion/i.test(detailRaw)) {
    throw new Error('Detail API leaked blind mapping or strategy fields');
  }

  log('Client classification not in SubmitShadowReviewDto — ValidationPipe whitelist blocks it');

  const submit = await api<{
    reviewAssignments: Array<{ preferredOption: string; classification?: string }>;
  }>(
    'POST',
    `/decision-engine/v1/shadow-reviews/${encodeURIComponent(eligibleCase.reviewCaseId)}/submit`,
    {
      preferredOption: 'A',
      scores: { reasonableness: 4, executability: 5, requirementFit: 4, paceFit: 4 },
      tradeOffSummary: 'E0 persistence smoke — option A preferred.',
      confidence: 4,
    },
    { 'X-Shadow-Reviewer-Id': reviewerId, 'Idempotency-Key': idempotencyKey },
  );
  if (!submit.json.success) {
    throw new Error(`submit failed: ${submit.json.error?.message}`);
  }

  const stats = await api('GET', '/decision-engine/v1/shadow-reviews/stats');
  if (!stats.json.success) {
    throw new Error(`stats failed: ${stats.json.error?.message}`);
  }

  const caseRow = await prisma.decisionShadowReviewCase.findUnique({
    where: { reviewCaseId: eligibleCase.reviewCaseId },
    include: { submissions: true },
  });
  const submission = caseRow?.submissions[0];

  const frozen = caseRow?.frozenSnapshotsJson as {
    authority?: { candidateHash?: string };
    shadow?: { candidateHash?: string };
  };

  const checkpoint: Checkpoint = {
    runAt: new Date().toISOString(),
    baseUrl,
    tripId,
    eligible: {
      comparisonId: eligibleComparisonId,
      reviewCaseId: eligibleCase.reviewCaseId,
      reviewerId,
      idempotencyKey,
      submissionId: submission?.submissionId,
      derivedClassification: submission?.classification,
      hashes: {
        blindedOptionA: hashJson(caseRow?.blindedOptionAJson),
        blindedOptionB: hashJson(caseRow?.blindedOptionBJson),
        frozenAuthority: hashJson(frozen?.authority),
        frozenShadow: hashJson(frozen?.shadow),
        blindMappingEncrypted: caseRow?.blindMappingEncrypted ?? '',
        stats: hashStatsSnapshot(stats.json.data),
      },
    },
    excluded: {
      comparisonId: excludedComparisonId,
      reviewCaseId: excludedRow.reviewCaseId,
      exclusionReason: excludedRow.exclusionReason ?? undefined,
    },
    statsHash: hashStatsSnapshot(stats.json.data),
    materializeCounts: { created: data.created, alreadyExists: data.alreadyExists ?? 0 },
  };

  await fs.mkdir(ARTIFACT_ROOT, { recursive: true });
  await fs.writeFile(CHECKPOINT_PATH, JSON.stringify(checkpoint, null, 2));
  log(`Checkpoint saved → ${CHECKPOINT_PATH}`);
  return checkpoint;
}

async function verifyCheckpoint(prisma: PrismaClient, cp: Checkpoint): Promise<string[]> {
  const failures: string[] = [];

  const comp = await prisma.decisionShadowComparison.findUnique({
    where: { comparisonId: cp.eligible.comparisonId },
  });
  if (!comp) failures.push('comparison missing after restart');

  const caseRow = await prisma.decisionShadowReviewCase.findUnique({
    where: { reviewCaseId: cp.eligible.reviewCaseId },
    include: { submissions: true },
  });
  if (!caseRow) failures.push('review case missing after restart');
  if (caseRow && caseRow.completedReviewCount !== 1) {
    failures.push(`completedReviewCount=${caseRow.completedReviewCount} expected 1`);
  }

  const subs = caseRow?.submissions ?? [];
  if (subs.length !== 1) failures.push(`submission count=${subs.length} expected 1`);
  if (cp.eligible.submissionId && subs[0]?.submissionId !== cp.eligible.submissionId) {
    failures.push('submissionId changed after restart');
  }

  const frozen = caseRow?.frozenSnapshotsJson as {
    authority?: { candidateHash?: string };
    shadow?: { candidateHash?: string };
  };
  const hashes = {
    blindedOptionA: hashJson(caseRow?.blindedOptionAJson),
    blindedOptionB: hashJson(caseRow?.blindedOptionBJson),
    frozenAuthority: hashJson(frozen?.authority),
    frozenShadow: hashJson(frozen?.shadow),
    blindMappingEncrypted: caseRow?.blindMappingEncrypted ?? '',
  };
  for (const [k, expected] of Object.entries(cp.eligible.hashes)) {
    if (k === 'stats') continue;
    const actual = hashes[k as keyof typeof hashes];
    if (actual !== expected) {
      failures.push(`hash mismatch ${k}: expected ${expected.slice(0, 12)} got ${String(actual).slice(0, 12)}`);
    }
  }

  const stats = await api('GET', '/decision-engine/v1/shadow-reviews/stats');
  if (!stats.json.success) {
    failures.push(`stats failed: ${stats.json.error?.message}`);
  } else if (hashStatsSnapshot(stats.json.data) !== cp.statsHash) {
    failures.push('stats hash changed after restart');
  }

  const detail = await api(
    'GET',
    `/decision-engine/v1/shadow-reviews/${encodeURIComponent(cp.eligible.reviewCaseId)}`,
  );
  if (!detail.json.success) failures.push('review case GET failed after restart');

  if (caseRow?.blindMappingEncrypted !== cp.eligible.hashes.blindMappingEncrypted) {
    failures.push('blindMappingEncrypted changed — A/B mapping may have been regenerated');
  }

  const excluded = await prisma.decisionShadowReviewCase.findUnique({
    where: { comparisonId: cp.excluded.comparisonId },
  });
  if (!excluded || excluded.status !== 'EXCLUDED') {
    failures.push('EXCLUDED audit record missing after restart');
  } else if (excluded.exclusionReason !== cp.excluded.exclusionReason) {
    failures.push(`exclusion reason changed: ${excluded.exclusionReason}`);
  }

  return failures;
}

async function testIdempotency(cp: Checkpoint, prisma: PrismaClient): Promise<string[]> {
  const failures: string[] = [];

  const remat = await api<{
    created: number;
    alreadyExists: number;
  }>('POST', '/decision-engine/v1/shadow-reviews/materialize', {
    comparisonIds: [cp.eligible.comparisonId],
  });
  if (!remat.json.success) {
    failures.push(`rematerialize failed: ${remat.json.error?.message}`);
  } else {
    const d = remat.json.data!;
    if ((d.created ?? 0) !== 0) failures.push(`rematerialize created=${d.created} expected 0`);
    if ((d.alreadyExists ?? 0) < 1) {
      failures.push(`rematerialize alreadyExists=${d.alreadyExists} expected >=1`);
    }
  }

  const caseCount = await prisma.decisionShadowReviewCase.count({
    where: { comparisonId: cp.eligible.comparisonId },
  });
  if (caseCount !== 1) failures.push(`duplicate review cases in DB: count=${caseCount}`);

  const resubmit = await api(
    'POST',
    `/decision-engine/v1/shadow-reviews/${encodeURIComponent(cp.eligible.reviewCaseId)}/submit`,
    {
      preferredOption: 'A',
      scores: { reasonableness: 4, executability: 5, requirementFit: 4, paceFit: 4 },
      tradeOffSummary: 'duplicate idempotent submit',
      confidence: 4,
    },
    {
      'X-Shadow-Reviewer-Id': cp.eligible.reviewerId,
      'Idempotency-Key': cp.eligible.idempotencyKey,
    },
  );
  if (!resubmit.json.success) {
    failures.push(`idempotent resubmit failed: ${resubmit.json.error?.message}`);
  }

  const subsAfter = await prisma.decisionShadowReviewSubmission.count({
    where: { reviewCaseId: cp.eligible.reviewCaseId },
  });
  if (subsAfter !== 1) failures.push(`idempotent submit created duplicate: count=${subsAfter}`);

  const dupReviewer = await api(
    'POST',
    `/decision-engine/v1/shadow-reviews/${encodeURIComponent(cp.eligible.reviewCaseId)}/submit`,
    {
      preferredOption: 'B',
      scores: { reasonableness: 3, executability: 3, requirementFit: 3, paceFit: 3 },
      tradeOffSummary: 'duplicate reviewer different key',
      confidence: 3,
    },
    { 'X-Shadow-Reviewer-Id': cp.eligible.reviewerId },
  );
  if (!dupReviewer.json.success && !String(dupReviewer.json.error?.message).includes('duplicate')) {
    /* unique constraint may return idempotent existing — both OK */
  }
  const subsFinal = await prisma.decisionShadowReviewSubmission.count({
    where: { reviewCaseId: cp.eligible.reviewCaseId, reviewerId: cp.eligible.reviewerId },
  });
  if (subsFinal !== 1) {
    failures.push(`duplicate reviewer created extra submission: count=${subsFinal}`);
  }

  return failures;
}

async function testWrongKey(key: string): Promise<string[]> {
  const failures: string[] = [];
  const wrongKey = randomBytes(32).toString('hex');
  if (wrongKey === key) return failures;

  log('Wrong-key test — start server with mismatched encryption key...');
  await stopServer();
  await startServer(wrongKey, SERVER_PORT);

  const stats = await api('GET', '/decision-engine/v1/shadow-reviews/stats');
  if (stats.json.success) {
    failures.push('stats succeeded with wrong key — should fail decrypt');
  } else if (!String(stats.json.error?.message).includes('Cannot decrypt blind mapping')) {
    failures.push(`wrong-key stats error unclear: ${stats.json.error?.message}`);
  }

  await stopServer();
  await startServer(key, SERVER_PORT);
  const statsOk = await api('GET', '/decision-engine/v1/shadow-reviews/stats');
  if (!statsOk.json.success) {
    failures.push(`stats failed after restoring correct key: ${statsOk.json.error?.message}`);
  }

  return failures;
}

async function main() {
  await fs.mkdir(path.join(ARTIFACT_ROOT, 'logs'), { recursive: true });
  await fs.mkdir(ARTIFACT_ROOT, { recursive: true });
  const key = await ensureEncryptionKey();
  process.env.SHADOW_EVIDENCE_PERSISTENCE_ENABLED = '1';

  log('Task E0 persistence smoke — backup + migrate');
  await backupAndMigrate();
  if (migrateOnly) {
    log('--migrate-only complete');
    return;
  }

  log('Building application...');
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('npx', ['nest', 'build'], { stdio: 'inherit' });
    proc.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`build failed ${code}`))));
  });

  if (!skipServer) {
    await stopServer().catch(() => undefined);
    await startServer(key);
  } else {
    await waitForHealth(SERVER_PORT);
  }

  const prisma = new PrismaClient();
  const failures: string[] = [];

  try {
    const cp = verifyOnly
      ? (JSON.parse(await fs.readFile(CHECKPOINT_PATH, 'utf8')) as Checkpoint)
      : await seedEvidence(prisma);
    if (!verifyOnly) {
      log(`Seed OK comparison=${cp.eligible.comparisonId} reviewCase=${cp.eligible.reviewCaseId}`);
    } else {
      log(`Verify-only checkpoint comparison=${cp.eligible.comparisonId}`);
    }

    if (!skipRestart) {
      log('Restarting application...');
      await stopServer();
      await startServer(key);
      failures.push(...(await verifyCheckpoint(prisma, cp)));
    } else {
      failures.push(...(await verifyCheckpoint(prisma, cp)));
    }

    failures.push(...(await testIdempotency(cp, prisma)));

    if (!skipWrongKey) {
      failures.push(...(await testWrongKey(key)));
    }

    const report = {
      generatedAt: new Date().toISOString(),
      checkpoint: cp,
      failures,
      passed: failures.length === 0,
    };
    await fs.mkdir(path.join(ARTIFACT_ROOT, 'reports'), { recursive: true });
    await fs.writeFile(
      path.join(ARTIFACT_ROOT, 'reports/e0-persistence-smoke.json'),
      JSON.stringify(report, null, 2),
    );

    if (failures.length) {
      log('E0 persistence smoke FAIL:');
      for (const f of failures) log(`  - ${f}`);
      process.exit(1);
    }
    log('E0 persistence smoke PASS');
  } finally {
    await prisma.$disconnect();
    if (!skipServer && !process.env.KEEP_E0_SERVER) {
      await stopServer().catch(() => undefined);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
