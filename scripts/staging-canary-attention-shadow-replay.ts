#!/usr/bin/env npx tsx
/**
 * Slice 4 — Staging Real-DB Replay (Observation Closure)
 *
 * Read-only shadow runs via Prisma → trip.metadata.rfc001DecisionProblems.
 * Does NOT mutate problems, queue, notifications, or enable Primary SSO.
 *
 * Usage:
 *   ATTENTION_ROOT_CAUSE_ORCHESTRATION=1 npm run attention:staging-replay
 *   ATTENTION_ROOT_CAUSE_ORCHESTRATION=1 npm run attention:staging-replay -- --scenario=STG-REPLAY-B
 *   ATTENTION_ROOT_CAUSE_ORCHESTRATION=1 npm run attention:staging-replay -- --trip-id=c0a55555-5555-4555-8555-555555555555
 *
 * `--env=staging` (default via npm script) loads `.env` then overlays `.env.staging`.
 */
import 'reflect-metadata';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import {
  getStagingReplayScenario,
  listStagingReplayScenarioIds,
  ATTENTION_SHADOW_CANARY_TRIP_ID,
} from '../src/trips/guardian-decision-core/attention/attention-shadow-staging-replay-catalog';
import {
  isAttentionOrchestrationPrimarySsoEnabled,
  isAttentionOrchestrationShadowEnabled,
} from '../src/trips/guardian-decision-core/config/rfc002-canonical.config';
import {
  applyScenarioProfileToTrip,
  collectStagingReplayRowsFromPrisma,
  resolveStagingReplayTripId,
  runStagingReplayFromPrismaRows,
} from './staging-canary-attention-shadow-replay.util';
import { profileForScenario } from './staging-canary-attention-seed-problems.util';

const PROJECT_ROOT = join(__dirname, '..');

function parseEnvProfile(argv: string[]): 'staging' | 'default' {
  const hit = argv.find((a) => a.startsWith('--env='));
  const explicit = hit?.split('=').slice(1).join('=');
  if (explicit === 'staging') return 'staging';
  if (explicit === 'default' || explicit === 'local') return 'default';
  return 'staging';
}

function loadProjectEnv(profile: 'staging' | 'default'): void {
  loadEnv({ path: join(PROJECT_ROOT, '.env') });
  if (profile === 'staging') {
    const stagingPath = join(PROJECT_ROOT, '.env.staging');
    loadEnv({ path: stagingPath, override: true });
    console.log(`env profile=staging (${stagingPath})`);
  } else {
    console.log('env profile=default (.env only)');
  }
}

loadProjectEnv(parseEnvProfile(process.argv));

const EVIDENCE_DIR = join(
  process.cwd(),
  'internal-docs/operations/evidence/attention-shadow',
);

function arg(name: string, fallback?: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.split('=').slice(1).join('=');
  return fallback;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function commitSha(): string {
  try {
    return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function databaseTarget(url: string): string {
  try {
    const parsed = new URL(url.replace(/^postgresql:/, 'http:'));
    const db = parsed.pathname.replace(/^\//, '').split('?')[0];
    return `${parsed.hostname}/${db}`;
  } catch {
    return 'unknown';
  }
}

interface ReplayRunRecord {
  scenarioId: string;
  evidencePath?: string;
  runId?: string;
  reviewStatus?: string;
  verdict?: string;
  autoPass?: boolean;
  pollingDuplicate?: boolean;
  rowSource?: string;
  problemCount?: number;
  error?: string;
}

function runScenario(
  input: {
    spec: NonNullable<ReturnType<typeof getStagingReplayScenario>>;
    rows: Awaited<ReturnType<typeof collectStagingReplayRowsFromPrisma>>;
    commitSha: string;
    dryRun: boolean;
    runId?: string;
  },
): ReplayRunRecord {
  const { evidence, evidencePath } = runStagingReplayFromPrismaRows({
    spec: input.spec,
    rows: input.rows.rows,
    commitSha: input.commitSha,
    runId: input.runId,
    rowSource: input.rows.rowSource,
    persistEvidence: !input.dryRun,
    lineageOverlay: input.rows.lineageOverlay,
  });

  console.log(
    `   cluster=${evidence.comparison.actualClusterCount}/${evidence.comparison.expectedClusterCount ?? '?'} primary=${evidence.comparison.actualPrimary ?? 'none'} attention=${evidence.comparison.actualAttention ?? 'none'} review=${evidence.comparison.reviewStatus}`,
  );
  console.log(`   problems=${input.rows.problemCount} source=${input.rows.rowSource}`);
  console.log(`   evidence: ${evidencePath ?? '(dry-run)'}`);

  return {
    scenarioId: input.spec.scenarioId,
    evidencePath,
    runId: evidence.runId,
    reviewStatus: evidence.comparison.reviewStatus,
    verdict: evidence.comparison.verdict,
    autoPass: evidence.comparison.reviewStatus === 'AUTO_PASS',
    rowSource: input.rows.rowSource,
    problemCount: input.rows.problemCount,
  };
}

function writeBatchSummary(input: {
  tripId: string;
  commitSha: string;
  runs: ReplayRunRecord[];
  dryRun: boolean;
  tripNote?: string;
}): string {
  const autoPending = input.runs.filter((r) => r.reviewStatus === 'AUTO_PENDING_HUMAN').length;
  const autoPass = input.runs.filter((r) => r.autoPass).length;
  const errors = input.runs.filter((r) => r.error).length;
  const pollingFails = input.runs.filter((r) => r.pollingDuplicate).length;

  const summary = {
    schemaId: 'tripnara.attention_shadow_staging_replay_batch@v1',
    generatedAt: new Date().toISOString(),
    commitSha: input.commitSha,
    tripId: input.tripId,
    tripNote: input.tripNote,
    rowSource: input.runs[0]?.rowSource,
    dryRun: input.dryRun,
    scenarioCount: input.runs.length,
    autoPassCount: autoPass,
    autoPendingHumanCount: autoPending,
    errorCount: errors,
    repeatedPollingDuplicate: pollingFails,
    runs: input.runs,
    observationClosureReady:
      input.runs.length >= 10 &&
      autoPending === 0 &&
      errors === 0 &&
      pollingFails === 0,
    note: 'Human adjudication still required before Observation Closure PASS',
  };

  const filename = `attention-shadow-staging-batch-${input.tripId}-${summary.generatedAt.replace(/[:.]/g, '-')}.json`;
  const fullPath = join(EVIDENCE_DIR, filename);
  if (!input.dryRun) {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(fullPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  }
  return fullPath;
}

async function main() {
  const dryRun = hasFlag('dry-run');
  const scenarioArg = arg('scenario', 'all');
  const preferredTripId = arg('trip-id', ATTENTION_SHADOW_CANARY_TRIP_ID);
  const sha = commitSha();

  if (!process.env.DATABASE_URL) {
    console.error('FAIL: DATABASE_URL not set');
    process.exit(1);
  }
  if (/tripnara_prod|production/i.test(process.env.DATABASE_URL)) {
    console.error('FAIL: production DATABASE_URL refused — use --env=staging or .env.staging');
    process.exit(1);
  }
  if (!isAttentionOrchestrationShadowEnabled()) {
    console.error('FAIL: set ATTENTION_ROOT_CAUSE_ORCHESTRATION=1');
    process.exit(1);
  }
  if (isAttentionOrchestrationPrimarySsoEnabled()) {
    console.error('FAIL: ATTENTION_ROOT_CAUSE_PRIMARY_SSO must remain 0 for Observation Closure');
    process.exit(1);
  }

  const scenarioIds =
    scenarioArg === 'all'
      ? listStagingReplayScenarioIds()
      : scenarioArg.split(',').map((s) => s.trim());

  const perScenarioProfile = !hasFlag('no-per-scenario-profile');
  const prisma = new PrismaClient();
  try {
    const { tripId, note: tripNote } = await resolveStagingReplayTripId(prisma, preferredTripId, {
      allowFallback: hasFlag('allow-sr5-fallback'),
    });

    console.log('Slice 4 Staging Real-DB Replay');
    console.log(
      `database=${databaseTarget(process.env.DATABASE_URL)} tripId=${tripId} commit=${sha.slice(0, 8)} scenarios=${scenarioIds.length} dryRun=${dryRun} perScenarioProfile=${perScenarioProfile}`,
    );
    if (tripNote) console.log(`note: ${tripNote}`);

    const runs: ReplayRunRecord[] = [];

    for (const scenarioId of scenarioIds) {
      const spec = getStagingReplayScenario(scenarioId);
      if (!spec) {
        runs.push({ scenarioId, error: `unknown scenario ${scenarioId}` });
        continue;
      }

      console.log(`\n── ${spec.scenarioId}: ${spec.title}`);
      console.log(`   setup: ${spec.setupHint}`);
      if (perScenarioProfile) {
        console.log(`   profile: ${profileForScenario(scenarioId)}`);
      }

      const collected = perScenarioProfile
        ? await applyScenarioProfileToTrip(prisma, tripId, scenarioId)
        : await collectStagingReplayRowsFromPrisma(prisma, tripId);

      if (scenarioId === 'STG-REPLAY-E') {
        const firstResult = runStagingReplayFromPrismaRows({
          spec: { ...spec, tripId },
          rows: collected.rows,
          commitSha: sha,
          runId: `${scenarioId}-poll-1`,
          rowSource: collected.rowSource,
          persistEvidence: !dryRun,
          lineageOverlay: collected.lineageOverlay,
        });
        const secondResult = runStagingReplayFromPrismaRows({
          spec: { ...spec, tripId },
          rows: collected.rows,
          commitSha: sha,
          runId: `${scenarioId}-poll-2`,
          rowSource: collected.rowSource,
          persistEvidence: !dryRun,
          lineageOverlay: collected.lineageOverlay,
        });
        const first = firstResult.evidence;
        const second = secondResult.evidence;
        const pollingDuplicate =
          second.comparison.actualClusterCount > first.comparison.actualClusterCount ||
          second.comparison.actualVisibleItemCount > first.comparison.actualVisibleItemCount;
        console.log(
          `   poll-1 cluster=${first.comparison.actualClusterCount} visible=${first.comparison.actualVisibleItemCount}`,
        );
        console.log(
          `   poll-2 cluster=${second.comparison.actualClusterCount} visible=${second.comparison.actualVisibleItemCount}`,
        );
        console.log(`   pollingDuplicate=${pollingDuplicate ? 'YES (FAIL)' : 'NO (PASS)'}`);
        runs.push({
          scenarioId,
          evidencePath: secondResult.evidencePath,
          runId: second.runId,
          reviewStatus: pollingDuplicate ? 'AUTO_PENDING_HUMAN' : second.comparison.reviewStatus,
          verdict: second.comparison.verdict,
          autoPass: !pollingDuplicate && second.comparison.reviewStatus === 'AUTO_PASS',
          pollingDuplicate,
          rowSource: collected.rowSource,
          problemCount: collected.problemCount,
        });
        continue;
      }

      runs.push(
        runScenario({
          spec: { ...spec, tripId },
          rows: collected,
          commitSha: sha,
          dryRun,
        }),
      );
    }

    const batchPath = writeBatchSummary({ tripId, commitSha: sha, runs, dryRun, tripNote });
    const pending = runs.filter((r) => r.reviewStatus === 'AUTO_PENDING_HUMAN').length;
    const failed = runs.filter((r) => r.error || r.pollingDuplicate).length;

    console.log('\n── Batch Summary ──');
    console.log(
      `runs=${runs.length} autoPass=${runs.filter((r) => r.autoPass).length} pendingHuman=${pending} errors=${failed}`,
    );
    console.log(`batch evidence: ${dryRun ? '(skipped)' : batchPath}`);

    if (failed > 0 || pending > 0) {
      console.log('\nNext: seed/exec-slip canary on staging OR prepare trip state per setupHint; then human adjudication.');
      process.exit(pending > 0 && failed === 0 ? 2 : 1);
    }
    console.log('\nAuto checks passed. Complete human adjudication before marking Observation Closure PASS.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
