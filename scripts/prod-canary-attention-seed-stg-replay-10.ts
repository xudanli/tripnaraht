#!/usr/bin/env npx tsx
/**
 * Seed Exec Slip Canary with STG-REPLAY-10 (slice4-10 wind chain) and verify Primary convergence.
 *
 * Usage:
 *   EXEC_SLIP_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-attention-seed-stg-replay-10.ts
 *   EXEC_SLIP_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-attention-seed-stg-replay-10.ts --verify-only
 */

import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { ATTENTION_SHADOW_CANARY_TRIP_ID } from '../src/trips/guardian-decision-core/attention/attention-shadow-staging-replay-catalog';
import { getStagingReplayScenario } from '../src/trips/guardian-decision-core/attention/attention-shadow-staging-replay-catalog';
import {
  applyScenarioProfileToTrip,
  collectStagingReplayRowsFromPrisma,
  runStagingReplayFromPrismaRows,
} from './staging-canary-attention-shadow-replay.util';
import {
  EXEC_SLIP_CANARY_TRIP_ID,
  EXEC_SLIP_CANARY_USER_ID,
} from './prod-canary-execution-slip-pre-signoff.constants';
import { gitCommitSha, httpJson, mintCanaryJwt } from './prod-canary-execution-slip-pre-signoff.util';

const API = process.env.BASE_URL?.trim() || 'http://127.0.0.1:3002/api';
const SCENARIO_ID = 'STG-REPLAY-10';
const TRIP_ID = process.env.ATTENTION_SEED_TRIP_ID?.trim() || EXEC_SLIP_CANARY_TRIP_ID;
const EVIDENCE_DIR = 'internal-docs/operations/evidence';

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function assertProdAllowed(): void {
  const url = process.env.DATABASE_URL ?? '';
  if (!url.includes('tripnara_prod') && process.env.EXEC_SLIP_DRILL_ALLOW_PROD !== '1') {
    throw new Error('Set EXEC_SLIP_DRILL_ALLOW_PROD=1 for prod canary seed');
  }
}

async function fetchDualRead(tripId: string, token: string) {
  return httpJson<{
    success: boolean;
    data?: {
      currentQueueItems: unknown[];
      attentionPrimaryItems: Array<{
        primaryProblemId: string;
        primarySemanticCapability: string;
        relatedEffects: Array<{ problemId: string }>;
      }>;
      comparison: {
        currentVisibleCount: number;
        attentionVisibleCount: number;
        reductionCount: number;
        hiddenProblemIds: string[];
        primaryProblemIds: string[];
        missedProblemIds: string[];
        openClusterCount: number;
        canonicalProblemCount: number;
      };
      shadowVerdict?: string;
    };
    error?: { code?: string; message?: string };
  }>('GET', `${API}/trips/${tripId}/internal/attention-dual-read`, { token });
}

async function main(): Promise<void> {
  assertProdAllowed();

  const spec = getStagingReplayScenario(SCENARIO_ID);
  if (!spec) throw new Error(`unknown scenario ${SCENARIO_ID}`);

  const prisma = new PrismaClient();
  const token = mintCanaryJwt(EXEC_SLIP_CANARY_USER_ID);
  const verifyOnly = hasFlag('verify-only');

  try {
    let collected;
    if (!verifyOnly) {
      console.log(`Seeding ${SCENARIO_ID} (slice4-10) on trip ${TRIP_ID}...`);
      collected = await applyScenarioProfileToTrip(prisma, TRIP_ID, SCENARIO_ID);
      console.log(`  seeded problems=${collected.problemCount} rowSource=${collected.rowSource}`);
    } else {
      collected = await collectStagingReplayRowsFromPrisma(prisma, TRIP_ID);
      console.log(`Verify-only: problems=${collected.problemCount}`);
    }

    const replay = runStagingReplayFromPrismaRows({
      spec: { ...spec, tripId: TRIP_ID },
      rows: collected.rows,
      commitSha: gitCommitSha(),
      runId: `${SCENARIO_ID}-prod-seed-verify`,
      rowSource: collected.rowSource,
      persistEvidence: true,
      lineageOverlay: collected.lineageOverlay,
    });

    const ev = replay.evidence;
    console.log('\n── Local shadow projection (Prisma rows + lineage) ──');
    console.log(
      `  clusters=${ev.comparison.actualClusterCount} visible=${ev.comparison.actualVisibleItemCount}`,
    );
    console.log(`  primary=${ev.comparison.actualPrimary ?? 'none'} attention=${ev.comparison.actualAttention ?? 'n/a'}`);
    console.log(`  verdict=${ev.comparison.verdict} review=${ev.comparison.reviewStatus}`);

    const dual = await fetchDualRead(TRIP_ID, token);
    if (!dual.json.success || !dual.json.data) {
      throw new Error(
        `Dual-read failed: code=${dual.json.error?.code ?? dual.status} msg=${dual.json.error?.message ?? 'unknown'}`,
      );
    }

    const d = dual.json.data;
    const primary = d.attentionPrimaryItems[0];
    const missedSeedProblems = d.comparison.missedProblemIds.filter((id) =>
      id.startsWith('stg_attn_'),
    );
    const missedLegacyOnly = d.comparison.missedProblemIds.filter((id) =>
      !id.startsWith('stg_attn_'),
    );

    console.log('\n── Live Dual-Read API ──');
    console.log(`  current=${d.comparison.currentVisibleCount} attention=${d.comparison.attentionVisibleCount}`);
    console.log(`  reduction=${d.comparison.reductionCount} canonical=${d.comparison.canonicalProblemCount}`);
    console.log(`  primaryIds=${d.comparison.primaryProblemIds.join(',') || '(none)'}`);
    console.log(`  hidden=${d.comparison.hiddenProblemIds.join(',') || '(none)'}`);
    console.log(`  missed(legacy)=${missedLegacyOnly.join(',') || '(none)'}`);
    console.log(`  missed(seed)=${missedSeedProblems.join(',') || '(none)'}`);
    console.log(`  shadowVerdict=${d.shadowVerdict ?? 'n/a'}`);

    const checks = {
      localVisibleOne: ev.comparison.actualVisibleItemCount === 1,
      localPrimaryInfeasible: ev.comparison.actualPrimary === 'EXECUTION_SCHEDULE_INFEASIBLE',
      apiPrimaryOne: d.comparison.attentionVisibleCount === 1,
      apiPrimaryCapability:
        primary?.primarySemanticCapability === 'EXECUTION_SCHEDULE_INFEASIBLE',
      apiHiddenNonEmpty: d.comparison.hiddenProblemIds.length >= 1,
      apiHiddenIncludesWind: d.comparison.hiddenProblemIds.includes('stg_attn_wind'),
      apiMissedSeedEmpty: missedSeedProblems.length === 0,
      apiReductionGte1: d.comparison.reductionCount >= 1,
      apiShadowVerdictMerge: d.shadowVerdict === 'CORRECT_MERGE',
    };

    const primaryConvergencePass = [
      'localVisibleOne',
      'localPrimaryInfeasible',
      'apiPrimaryOne',
      'apiPrimaryCapability',
      'apiHiddenNonEmpty',
      'apiHiddenIncludesWind',
      'apiMissedSeedEmpty',
      'apiReductionGte1',
      'apiShadowVerdictMerge',
    ].every((k) => checks[k as keyof typeof checks]);

    console.log('\n── Convergence checks ──');
    for (const [k, v] of Object.entries(checks)) {
      console.log(`  [${v ? 'PASS' : 'FAIL'}] ${k}`);
    }

    const pass = primaryConvergencePass;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const evidencePath = `${EVIDENCE_DIR}/slice4-stg-replay-10-primary-convergence-${stamp}.json`;
    writeFileSync(
      evidencePath,
      `${JSON.stringify(
        {
          evidenceType: 'SLICE4_STG_REPLAY_10_PRIMARY_CONVERGENCE',
          testedAt: new Date().toISOString(),
          scenarioId: SCENARIO_ID,
          tripId: TRIP_ID,
          verifyOnly,
          localReplay: {
            actualClusterCount: ev.comparison.actualClusterCount,
            actualVisibleItemCount: ev.comparison.actualVisibleItemCount,
            actualPrimary: ev.comparison.actualPrimary,
            actualAttention: ev.comparison.actualAttention,
            verdict: ev.comparison.verdict,
            reviewStatus: ev.comparison.reviewStatus,
            evidencePath: replay.evidencePath,
          },
          liveDualRead: d,
          missedLegacyOnly,
          missedSeedProblems,
          checks,
          primaryConvergencePass,
          overallPass: pass,
        },
        null,
        2,
      )}\n`,
    );

    console.log(`\nEvidence: ${evidencePath}`);
    console.log(pass ? '\nSTG-REPLAY-10 Primary Convergence = PASS' : '\nSTG-REPLAY-10 Primary Convergence = FAIL');

    if (TRIP_ID !== ATTENTION_SHADOW_CANARY_TRIP_ID) {
      console.log(`note: catalog default trip=${ATTENTION_SHADOW_CANARY_TRIP_ID}`);
    }

    if (!pass) process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
