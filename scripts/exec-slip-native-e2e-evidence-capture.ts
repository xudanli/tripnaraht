#!/usr/bin/env npx tsx
/**
 * Capture Native E2E evidence fields from current canary trip state + optional API replay.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import {
  EXEC_SLIP_CANARY_ACTIVITY_A_ID,
  EXEC_SLIP_CANARY_TRIP_ID,
  EXEC_SLIP_INITIAL_PLAN_ID,
  EXEC_SLIP_SCENARIO_A_OBSERVED_AT,
  EXEC_SLIP_SCENARIO_B_OBSERVED_AT,
} from './prod-canary-execution-slip-pre-signoff.constants';
import {
  effectivePlanVersionId,
  gitCommitSha,
  legacyWriteCount,
  listObservations,
  listProblems,
  loadTrip,
  mintCanaryJwt,
  tripMetadata,
} from './prod-canary-execution-slip-pre-signoff.util';

async function main() {
  const prisma = new PrismaClient();
  try {
    const trip = await loadTrip(prisma);
    const meta = tripMetadata(trip.metadata);
    const observations = listObservations(meta);
    const slipObs = observations.filter((o) => o.source === 'USER_REPORT');
    const execProblems = listProblems(meta).filter(
      (p) => p.semanticCapability === 'EXECUTION_SCHEDULE_INFEASIBLE',
    );
    const planVersionId = effectivePlanVersionId(meta);

    const infeasibleObs = [...slipObs]
      .reverse()
      .find((o) => o.observedAt === EXEC_SLIP_SCENARIO_A_OBSERVED_AT);
    const feasibleObs = [...slipObs]
      .reverse()
      .find((o) => o.observedAt === EXEC_SLIP_SCENARIO_B_OBSERVED_AT);

    const resolvedProblem = [...execProblems]
      .reverse()
      .find((p) => p.status === 'RESOLVED');
    const openProblem = execProblems.find((p) => !['RESOLVED', 'FAILED'].includes(p.status));

    console.log(
      JSON.stringify(
        {
          tripId: EXEC_SLIP_CANARY_TRIP_ID,
          activityAId: EXEC_SLIP_CANARY_ACTIVITY_A_ID,
          planVersionId,
          initialPlanId: EXEC_SLIP_INITIAL_PLAN_ID,
          legacyWriteInvocations: legacyWriteCount(meta),
          observationInfeasible: infeasibleObs ?? null,
          observationFeasible: feasibleObs ?? null,
          resolvedProblem: resolvedProblem ?? null,
          openProblem: openProblem ?? null,
          allExecProblems: execProblems.map((p) => ({
            problemId: p.problemId,
            status: p.status,
            detectedAt: p.detectedAt,
          })),
          commitSha: gitCommitSha(),
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

void main();
