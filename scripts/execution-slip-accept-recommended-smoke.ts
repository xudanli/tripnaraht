#!/usr/bin/env npx tsx
/**
 * Smoke: accept-recommended with non-default repair candidate (substitute).
 *
 * Prerequisite: bash scripts/execution-slip-preflight.sh (or Phase A complete)
 *
 * Usage:
 *   EXEC_SLIP_DRILL_ALLOW_PROD=1 npx tsx scripts/execution-slip-accept-recommended-smoke.ts
 *   EXEC_SLIP_DRILL_ALLOW_PROD=1 npx tsx scripts/execution-slip-accept-recommended-smoke.ts --action=cand_remove_next
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { EXECUTION_SLIP_CANDIDATE_IDS } from '../src/trips/guardian-decision-core/contracts/execution-slip.types';
import {
  EXEC_SLIP_CANARY_TRIP_ID,
  EXEC_SLIP_INITIAL_PLAN_ID,
} from './prod-canary-execution-slip-pre-signoff.constants';
import {
  arg,
  effectivePlanVersionId,
  httpJson,
  legacyWriteCount,
  listProblems,
  mintCanaryJwt,
  openProblems,
  requireProdWrite,
  tripMetadata,
} from './prod-canary-execution-slip-pre-signoff.util';

const BASE = (process.env.BASE_URL ?? 'http://localhost:3002').replace(/\/$/, '');
const API = `${BASE}/api`;
const TRIP_ID = EXEC_SLIP_CANARY_TRIP_ID;
const ACTION =
  arg('action') ?? EXECUTION_SLIP_CANDIDATE_IDS.SUBSTITUTE_NEXT_ACTIVITY;

async function main() {
  requireProdWrite();
  const token = mintCanaryJwt();
  const prisma = new PrismaClient();

  try {
    const trip = await prisma.trip.findUnique({
      where: { id: TRIP_ID },
      select: { metadata: true },
    });
    if (!trip) throw new Error(`Trip not found: ${TRIP_ID}`);

    const metaBefore = tripMetadata(trip.metadata);
    const problem = openProblems(metaBefore).find(
      (p) => p.semanticCapability === 'EXECUTION_SCHEDULE_INFEASIBLE',
    );
    if (!problem?.problemId) {
      throw new Error('No open EXECUTION_SCHEDULE problem — run execution-slip-preflight.sh first');
    }

    const planBefore = effectivePlanVersionId(metaBefore);
    console.log(`problemId=${problem.problemId} planBefore=${planBefore} action=${ACTION}`);

    const queue = await httpJson<{
      success?: boolean;
      data?: {
        items?: Array<{
          problemId: string;
          affectedActivities?: Array<{ activityId: string; title: string }>;
        }>;
      };
    }>('GET', `${API}/trips/${TRIP_ID}/decision-queue`, { token });

    const item = queue.json.data?.items?.find((i) => i.problemId === problem.problemId);
    console.log(
      `decision-queue item: affectedActivities=${JSON.stringify(item?.affectedActivities ?? [])}`,
    );

    const accept = await httpJson<{
      success?: boolean;
      data?: {
        submit?: { status: string; problemId: string };
        apply?: { revalidation?: { status: string; message?: string } };
      };
      error?: { message?: string; code?: string };
    }>('POST', `${API}/trips/${TRIP_ID}/decision-queue/${problem.problemId}/accept-recommended`, {
      token,
      body: {
        actionId: ACTION,
        acknowledgement: [
          '我确认在了解阻断原因后仍执行该方案',
          '我已了解该决策对行程的影响与约束说明',
          '我确认已知悉相关风险并自愿承担决策后果',
          '我确认已阅读方案说明并同意应用该修复',
        ],
      },
    });

    if (!accept.json.success) {
      throw new Error(
        `accept-recommended failed: ${accept.json.error?.message ?? JSON.stringify(accept.json)}`,
      );
    }
    if (accept.status !== 200 && accept.status !== 201) {
      throw new Error(`accept-recommended HTTP ${accept.status}: ${accept.json.error?.message ?? JSON.stringify(accept.json)}`);
    }

    const tripAfter = await prisma.trip.findUnique({
      where: { id: TRIP_ID },
      select: { metadata: true },
    });
    const metaAfter = tripMetadata(tripAfter?.metadata);
    const planAfter = effectivePlanVersionId(metaAfter);
    const resolved = listProblems(metaAfter).find((p) => p.problemId === problem.problemId);
    const revalidationStatus = accept.json.data?.apply?.revalidation?.status ?? 'n/a';

    console.log('--- accept-recommended result ---');
    console.log(JSON.stringify(accept.json.data, null, 2));
    console.log(`planAfter=${planAfter} problemStatus=${resolved?.status} revalidation=${revalidationStatus}`);
    console.log(`legacyWriteInvocations=${legacyWriteCount(metaAfter)}`);

    const pass =
      (accept.status === 200 || accept.status === 201) &&
      planAfter !== planBefore &&
      planAfter !== EXEC_SLIP_INITIAL_PLAN_ID &&
      resolved?.status === 'RESOLVED' &&
      legacyWriteCount(metaAfter) === 0;

    if (!pass) {
      throw new Error('accept-recommended smoke FAILED — see logs above');
    }
    console.log('PASS: accept-recommended smoke');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('FAIL:', e.message ?? e);
  process.exit(1);
});
