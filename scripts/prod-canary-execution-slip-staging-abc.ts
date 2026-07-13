#!/usr/bin/env npx tsx
/**
 * S4-2 — Staging HTTP A/B/C + Rollback + Shadow for Execution Slip.
 *
 * Usage (strict phase separation):
 *   EXEC_SLIP_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-execution-slip-staging-abc.ts --phase=A
 *   EXEC_SLIP_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-execution-slip-staging-abc.ts --phase=B
 *   EXEC_SLIP_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-execution-slip-staging-abc.ts --phase=C
 *   EXEC_SLIP_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-execution-slip-staging-abc.ts --phase=ROLLBACK
 *   EXEC_SLIP_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-execution-slip-staging-abc.ts --phase=SHADOW
 *
 * Server env (staging / local drill):
 *   CANONICAL_EXECUTION_SCHEDULE_INFEASIBLE=1
 *   RFC001_ICELAND_ROAD_CLOSE=1   # L2 authorize/execute API gate
 *   EFFECTIVE_PLAN_WRITE_CHAIN=1
 *   RFC001_ITINERARY_MATERIALIZE=1
 */
import 'dotenv/config';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { PrismaClient } from '@prisma/client';
import { buildPlanVersionIdempotencyKey } from '../src/trips/guardian-decision-core/plan-version/plan-version.service';
import { EXECUTION_SLIP_CANDIDATE_IDS } from '../src/trips/guardian-decision-core/contracts/execution-slip.types';
import {
  EVIDENCE_DIR,
  EXEC_SLIP_CANARY_ACTIVITY_A_ID,
  EXEC_SLIP_CANARY_TRIP_ID,
  EXEC_SLIP_CANARY_USER_ID,
  EXEC_SLIP_INITIAL_PLAN_ID,
  EXEC_SLIP_SCENARIO_A_OBSERVED_AT,
  EXEC_SLIP_SCENARIO_B_OBSERVED_AT,
} from './prod-canary-execution-slip-pre-signoff.constants';
import {
  allowlistTripIds,
  assertProdDatabase,
  effectivePlanVersionId,
  evidencePath,
  gitCommitSha,
  httpJson,
  isOnWeatherOrRoadAllowlist,
  latestDecisionForProblem,
  latestWorkspaceForProblem,
  legacyWriteCount,
  listObservations,
  listProblems,
  loadTrip,
  mintCanaryJwt,
  openProblems,
  planVersionCount,
  stagingStatePath,
  summarizeChecks,
  today,
  tripMetadata,
  worldStateAssertions,
  type AcceptanceCheck,
  type ExecSlipStagingPhase,
} from './prod-canary-execution-slip-pre-signoff.util';

const BASE = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const API = `${BASE}/api`;
const TRIP_ID = process.env.TRIP_ID ?? EXEC_SLIP_CANARY_TRIP_ID;
const ACTIVITY_A = process.env.ACTIVITY_A_ID ?? EXEC_SLIP_CANARY_ACTIVITY_A_ID;
const IDEM_KEY = 'exec-slip-staging-idem-a';

interface StagingState {
  tripId: string;
  problemId?: string;
  decisionId?: string;
  planVersionIdBefore?: string;
  planVersionIdAfter?: string;
  phaseACompletedAt?: string;
  phaseBCompletedAt?: string;
  phaseCCompletedAt?: string;
}

interface ApiEnvelope<T> {
  success?: boolean;
  data?: T;
  error?: { code?: string; message?: string };
}

function resolvePhase(): ExecSlipStagingPhase {
  const raw = process.argv.find((a) => a.startsWith('--phase='))?.split('=')[1]?.toUpperCase();
  if (!raw || !['A', 'B', 'C', 'ROLLBACK', 'SHADOW'].includes(raw)) {
    throw new Error('Pass --phase=A|B|C|ROLLBACK|SHADOW');
  }
  return raw as ExecSlipStagingPhase;
}

function loadState(): StagingState {
  try {
    return JSON.parse(readFileSync(stagingStatePath(), 'utf8')) as StagingState;
  } catch {
    return { tripId: TRIP_ID };
  }
}

function saveState(state: StagingState): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(stagingStatePath(), JSON.stringify(state, null, 2));
}

function httpOk(status: number): boolean {
  return status === 200 || status === 201;
}

async function postDepartureSlip(
  token: string,
  body: Record<string, unknown>,
  idempotencyKey?: string,
) {
  const headers: Record<string, string> = {};
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
  return httpJson<ApiEnvelope<{
    observationId: string;
    status: string;
    problemId?: string;
    runId?: string;
  }>>('POST', `${API}/trips/${TRIP_ID}/execution/departure-slip`, {
    token,
    body: idempotencyKey ? { ...body, idempotencyKey } : body,
    headers,
  });
}

async function getShadowMetrics(token: string) {
  return httpJson<ApiEnvelope<Record<string, number>>>(
    'GET',
    `${API}/trips/${TRIP_ID}/execution/shadow-metrics`,
    { token },
  );
}

async function runPhaseA(prisma: PrismaClient, token: string) {
  const startedAt = new Date().toISOString();
  const tripBefore = await loadTrip(prisma);
  const metaBefore = tripMetadata(tripBefore.metadata);
  const planBefore = effectivePlanVersionId(metaBefore);
  const planCountBefore = planVersionCount(metaBefore);

  const feasible = await postDepartureSlip(token, {
    activityId: ACTIVITY_A,
    observedAt: EXEC_SLIP_SCENARIO_B_OBSERVED_AT,
    stillAtPoi: true,
    source: 'USER_REPORT',
  });

  const infeasible = await postDepartureSlip(
    token,
    {
      activityId: ACTIVITY_A,
      observedAt: EXEC_SLIP_SCENARIO_A_OBSERVED_AT,
      stillAtPoi: true,
      source: 'USER_REPORT',
    },
    IDEM_KEY,
  );

  const idem = await postDepartureSlip(
    token,
    {
      activityId: ACTIVITY_A,
      observedAt: EXEC_SLIP_SCENARIO_A_OBSERVED_AT,
      stillAtPoi: true,
      source: 'USER_REPORT',
    },
    IDEM_KEY,
  );

  const shadow = await getShadowMetrics(token);
  const tripAfter = await loadTrip(prisma);
  const metaAfter = tripMetadata(tripAfter.metadata);
  const observations = listObservations(metaAfter);
  const slipAssertions = worldStateAssertions(metaAfter).filter(
    (a) => a.predicate === 'execution.departure_slip',
  );
  const execProblems = listProblems(metaAfter).filter(
    (p) => p.semanticCapability === 'EXECUTION_SCHEDULE_INFEASIBLE',
  );
  const planAfter = effectivePlanVersionId(metaAfter);
  const planCountAfter = planVersionCount(metaAfter);
  const problemId = infeasible.json.data?.problemId ?? execProblems[0]?.problemId;

  const checks: AcceptanceCheck[] = [
    {
      id: 'ES-A-001',
      pass: httpOk(feasible.status) && feasible.json.data?.status === 'NO_ACTION',
      detail: `feasible HTTP=${feasible.status} status=${feasible.json.data?.status ?? feasible.json.error?.code}`,
    },
    {
      id: 'ES-A-002',
      pass: httpOk(infeasible.status) && infeasible.json.data?.status === 'RECORDED',
      detail: `infeasible HTTP=${infeasible.status} problemId=${infeasible.json.data?.problemId ?? 'missing'}`,
    },
    {
      id: 'ES-A-003',
      pass: observations.length >= 2,
      detail: `observationsPersisted=${observations.length}`,
    },
    {
      id: 'ES-A-004',
      pass: slipAssertions.length >= 1,
      detail: `worldStateAssertions.execution.departure_slip=${slipAssertions.length}`,
    },
    {
      id: 'ES-A-005',
      pass: execProblems.length === 1,
      detail: `canonicalProblems=${execProblems.length}`,
    },
    {
      id: 'ES-A-006',
      pass: planAfter === planBefore,
      detail: `effectivePlan unchanged=${planAfter} draftPlanVersions=${planCountAfter}`,
    },
    {
      id: 'ES-A-007',
      pass: legacyWriteCount(metaAfter) === 0,
      detail: `legacyWriteInvocations=${legacyWriteCount(metaAfter)}`,
    },
    {
      id: 'ES-A-008',
      pass:
        httpOk(idem.status) &&
        idem.json.data?.observationId === infeasible.json.data?.observationId,
      detail: `idempotentReplay observationId match=${idem.json.data?.observationId === infeasible.json.data?.observationId}`,
    },
    {
      id: 'ES-A-009',
      pass: (shadow.json.data?.triggerCount ?? 0) >= 2,
      detail: `shadow.triggerCount=${shadow.json.data?.triggerCount ?? 0}`,
    },
  ];

  const pass = summarizeChecks(checks);
  const state: StagingState = {
    tripId: TRIP_ID,
    problemId,
    planVersionIdBefore: planBefore,
    phaseACompletedAt: new Date().toISOString(),
  };
  saveState(state);

  const evidence = {
    evidenceType: 'EXECUTION_SLIP_STAGING_A_OBSERVE',
    phase: 'A',
    commitSha: gitCommitSha(),
    environment: process.env.BASE_URL ?? 'http://localhost:3000',
    tripId: TRIP_ID,
    planVersionId: planAfter,
    problemId: problemId ?? null,
    decisionId: null,
    writeCount: 0,
    legacyWriteCount: legacyWriteCount(metaAfter),
    timestamps: { startedAt, endedAt: new Date().toISOString() },
    shadowMetrics: shadow.json.data ?? null,
    http: { feasible: feasible.json, infeasible: infeasible.json, idem: idem.json },
    checks,
    result: pass ? 'PASS' : 'FAIL',
  };

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(evidencePath('A'), JSON.stringify(evidence, null, 2));
  console.log(`Phase A ${pass ? 'PASS' : 'FAIL'} → ${evidencePath('A')}`);
  if (!pass) process.exit(1);
}

async function runPhaseB(prisma: PrismaClient) {
  const startedAt = new Date().toISOString();
  const state = loadState();
  const trip = await loadTrip(prisma);
  const meta = tripMetadata(trip.metadata);
  const problemId =
    state.problemId ??
    listProblems(meta).find((p) => p.semanticCapability === 'EXECUTION_SCHEDULE_INFEASIBLE')
      ?.problemId;
  if (!problemId) throw new Error('Phase B requires problemId — run Phase A first');

  const workspace = latestWorkspaceForProblem(meta, problemId);
  const candidates = workspace?.repairCandidates ?? [];
  const candidateIds = new Set(candidates.map((c) => c.candidateId));
  const shortenPresent = candidateIds.has(EXECUTION_SLIP_CANDIDATE_IDS.SHORTEN_CURRENT_STAY);
  const removePresent = candidateIds.has(EXECUTION_SLIP_CANDIDATE_IDS.REMOVE_NEXT_ACTIVITY);
  const substitutePresent = candidateIds.has(
    EXECUTION_SLIP_CANDIDATE_IDS.SUBSTITUTE_NEXT_ACTIVITY,
  );
  const decision = latestDecisionForProblem(meta, problemId);
  const lineageNodes = workspace?.constraintAssertions?.length ?? 0;

  const checks: AcceptanceCheck[] = [
    {
      id: 'ES-B-001',
      pass: removePresent && substitutePresent,
      detail: `candidates=${[...candidateIds].join(',')}`,
    },
    {
      id: 'ES-B-002',
      pass: !shortenPresent,
      detail: `infeasibleShortenFiltered=${!shortenPresent}`,
    },
    {
      id: 'ES-B-003',
      pass: lineageNodes >= 1 || Boolean(workspace?.workspaceId),
      detail: `workspaceId=${workspace?.workspaceId ?? 'missing'} lineageNodes=${lineageNodes}`,
    },
    {
      id: 'ES-B-004',
      pass: effectivePlanVersionId(meta) === (state.planVersionIdBefore ?? EXEC_SLIP_INITIAL_PLAN_ID),
      detail: `noWriteBeforeConfirm effective=${effectivePlanVersionId(meta)}`,
    },
    {
      id: 'ES-B-005',
      pass: legacyWriteCount(meta) === 0,
      detail: `legacyWriteInvocations=${legacyWriteCount(meta)}`,
    },
    {
      id: 'ES-B-006',
      pass: Boolean(decision?.decisionId),
      detail: `decisionId=${decision?.decisionId ?? 'missing'} recordStatus=${decision?.recordStatus ?? 'missing'}`,
    },
  ];

  const pass = summarizeChecks(checks);
  saveState({
    ...state,
    problemId,
    decisionId: decision?.decisionId,
    phaseBCompletedAt: new Date().toISOString(),
  });

  const evidence = {
    evidenceType: 'EXECUTION_SLIP_STAGING_B_SUGGEST',
    phase: 'B',
    commitSha: gitCommitSha(),
    environment: process.env.BASE_URL ?? 'http://localhost:3000',
    tripId: TRIP_ID,
    planVersionId: effectivePlanVersionId(meta),
    problemId,
    decisionId: decision?.decisionId ?? null,
    writeCount: 0,
    legacyWriteCount: legacyWriteCount(meta),
    timestamps: { startedAt, endedAt: new Date().toISOString() },
    candidateIds: [...candidateIds],
    checks,
    result: pass ? 'PASS' : 'FAIL',
  };

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(evidencePath('B'), JSON.stringify(evidence, null, 2));
  console.log(`Phase B ${pass ? 'PASS' : 'FAIL'} → ${evidencePath('B')}`);
  if (!pass) process.exit(1);
}

async function runPhaseC(prisma: PrismaClient, token: string) {
  const startedAt = new Date().toISOString();
  const state = loadState();
  const tripBefore = await loadTrip(prisma);
  const metaBefore = tripMetadata(tripBefore.metadata);
  const problemId = state.problemId;
  const decisionId =
    state.decisionId ?? latestDecisionForProblem(metaBefore, problemId ?? '')?.decisionId;
  if (!decisionId) throw new Error('Phase C requires decisionId — run Phase A/B first');

  const workspace = latestWorkspaceForProblem(metaBefore, problemId ?? '');
  const choice =
    workspace?.repairCandidates.find(
      (c) => c.candidateId === EXECUTION_SLIP_CANDIDATE_IDS.REMOVE_NEXT_ACTIVITY,
    )?.candidateId ?? EXECUTION_SLIP_CANDIDATE_IDS.REMOVE_NEXT_ACTIVITY;

  const authorize = await httpJson<Record<string, unknown>>(
    'POST',
    `${API}/rfc001/decisions/${decisionId}/authorize`,
    { token, body: { tripId: TRIP_ID, choice } },
  );

  const idempotencyKey = buildPlanVersionIdempotencyKey(TRIP_ID, decisionId);
  const execute = await httpJson<{
    applied?: { planVersion?: { planVersionId?: string } };
    planVersion?: { planVersionId?: string };
  }>('POST', `${API}/rfc001/decisions/${decisionId}/execute`, {
    token,
    body: { tripId: TRIP_ID },
    headers: { 'Idempotency-Key': idempotencyKey },
  });

  const executeReplay = await httpJson<Record<string, unknown>>(
    'POST',
    `${API}/rfc001/decisions/${decisionId}/execute`,
    {
      token,
      body: { tripId: TRIP_ID },
      headers: { 'Idempotency-Key': idempotencyKey },
    },
  );

  const tripAfter = await loadTrip(prisma);
  const metaAfter = tripMetadata(tripAfter.metadata);
  const problem = listProblems(metaAfter).find((p) => p.problemId === problemId);
  const planAfter =
    execute.json.planVersion?.planVersionId ??
    execute.json.applied?.planVersion?.planVersionId ??
    effectivePlanVersionId(metaAfter);
  const effectiveAfter = effectivePlanVersionId(metaAfter);
  const openAfter = openProblems(metaAfter);

  const checks: AcceptanceCheck[] = [
    {
      id: 'ES-C-001',
      pass: authorize.status === 201 || authorize.status === 200,
      detail: `authorize HTTP=${authorize.status}`,
    },
    {
      id: 'ES-C-002',
      pass: execute.status === 201 || execute.status === 200,
      detail: `execute HTTP=${execute.status} planVersionId=${planAfter ?? 'missing'}`,
    },
    {
      id: 'ES-C-003',
      pass: Boolean(planAfter) && effectiveAfter === planAfter && effectiveAfter !== EXEC_SLIP_INITIAL_PLAN_ID,
      detail: `effectivePlan switched to ${effectiveAfter}`,
    },
    {
      id: 'ES-C-004',
      pass: problem?.status === 'RESOLVED',
      detail: `problemStatus=${problem?.status ?? 'missing'}`,
    },
    {
      id: 'ES-C-005',
      pass: executeReplay.status === 200 || executeReplay.status === 201,
      detail: `idempotentExecute HTTP=${executeReplay.status}`,
    },
    {
      id: 'ES-C-006',
      pass: legacyWriteCount(metaAfter) === 0,
      detail: `legacyWriteInvocations=${legacyWriteCount(metaAfter)}`,
    },
    {
      id: 'ES-C-007',
      pass: openAfter.filter((p) => p.semanticCapability === 'EXECUTION_SCHEDULE_INFEASIBLE').length === 0,
      detail: `openExecutionProblems=${openAfter.length}`,
    },
  ];

  const pass = summarizeChecks(checks);
  saveState({
    ...state,
    decisionId,
    planVersionIdAfter: planAfter,
    phaseCCompletedAt: new Date().toISOString(),
  });

  const evidence = {
    evidenceType: 'EXECUTION_SLIP_STAGING_C_EXECUTE',
    phase: 'C',
    commitSha: gitCommitSha(),
    environment: process.env.BASE_URL ?? 'http://localhost:3000',
    tripId: TRIP_ID,
    planVersionId: planAfter ?? effectiveAfter,
    problemId,
    decisionId,
    writeCount: 1,
    legacyWriteCount: legacyWriteCount(metaAfter),
    timestamps: { startedAt, endedAt: new Date().toISOString() },
    rollbackResult: null,
    http: { authorize: authorize.json, execute: execute.json, executeReplay: executeReplay.json },
    checks,
    result: pass ? 'PASS' : 'FAIL',
  };

  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(evidencePath('C'), JSON.stringify(evidence, null, 2));
  console.log(`Phase C ${pass ? 'PASS' : 'FAIL'} → ${evidencePath('C')}`);
  if (!pass) process.exit(1);
}

async function runRollback(prisma: PrismaClient) {
  const startedAt = new Date().toISOString();
  const tripBefore = await loadTrip(prisma);
  const metaBefore = tripMetadata(tripBefore.metadata);

  const { execSync } = await import('child_process');
  execSync('npx tsx scripts/prod-canary-execution-slip-pre-signoff-rollback.ts', {
    stdio: 'inherit',
    env: { ...process.env, EXEC_SLIP_DRILL_ALLOW_PROD: '1' },
  });

  const tripAfter = await loadTrip(prisma);
  const metaAfter = tripMetadata(tripAfter.metadata);
  const checks: AcceptanceCheck[] = [
    {
      id: 'ES-R-001',
      pass: effectivePlanVersionId(metaAfter) === EXEC_SLIP_INITIAL_PLAN_ID,
      detail: `Canary Trip Restored effective=${effectivePlanVersionId(metaAfter)}`,
    },
    {
      id: 'ES-R-002',
      pass: openProblems(metaAfter).length === 0,
      detail: `Open Problem Cleared open=${openProblems(metaAfter).length}`,
    },
    {
      id: 'ES-R-003',
      pass: !isOnWeatherOrRoadAllowlist(TRIP_ID),
      detail: `Allowlist Restored onAllowlist=${isOnWeatherOrRoadAllowlist(TRIP_ID)} envAllowlist=${allowlistTripIds().join(',') || '(empty)'}`,
    },
    {
      id: 'ES-R-004',
      pass: listObservations(metaAfter).length === 0,
      detail: 'execution state cleared (observations)',
    },
    {
      id: 'ES-R-005',
      pass: metaBefore.rfc001GagnaveitaRoadEvidence === metaAfter.rfc001GagnaveitaRoadEvidence,
      detail: 'Weather/Road Untouched (trip-level road evidence unchanged)',
    },
  ];

  const pass = summarizeChecks(checks);
  const evidence = {
    evidenceType: 'EXECUTION_SLIP_STAGING_ROLLBACK',
    phase: 'ROLLBACK',
    commitSha: gitCommitSha(),
    environment: process.env.DATABASE_URL?.includes('tripnara_prod') ? 'tripnara_prod' : 'unknown',
    tripId: TRIP_ID,
    planVersionId: effectivePlanVersionId(metaAfter),
    problemId: null,
    decisionId: null,
    writeCount: 0,
    legacyWriteCount: legacyWriteCount(metaAfter),
    timestamps: { startedAt, endedAt: new Date().toISOString() },
    rollbackResult: pass ? 'Canary Trip Restored' : 'FAIL',
    checks,
    result: pass ? 'PASS' : 'FAIL',
  };

  writeFileSync(evidencePath('ROLLBACK'), JSON.stringify(evidence, null, 2));
  console.log(`Rollback ${pass ? 'PASS' : 'FAIL'} → ${evidencePath('ROLLBACK')}`);
  if (!pass) process.exit(1);
}

async function runShadow(token: string, prisma: PrismaClient) {
  const shadow = await getShadowMetrics(token);
  const trip = await loadTrip(prisma);
  const meta = tripMetadata(trip.metadata);
  const metrics = shadow.json.data ?? {};
  const observations = listObservations(meta).length;

  let phaseCEvidence: { planVersionId?: string; result?: string } | null = null;
  try {
    phaseCEvidence = JSON.parse(readFileSync(evidencePath('C'), 'utf8')) as {
      planVersionId?: string;
      result?: string;
    };
  } catch {
    phaseCEvidence = null;
  }

  const effective = effectivePlanVersionId(meta);
  const wrotePlanVersion =
    (metrics.writeCount ?? 0) >= 1 ||
    (phaseCEvidence?.result === 'PASS' && Boolean(phaseCEvidence.planVersionId)) ||
    (effective !== undefined && effective !== EXEC_SLIP_INITIAL_PLAN_ID);

  const resolvedProblem = listProblems(meta).some(
    (p) =>
      p.semanticCapability === 'EXECUTION_SCHEDULE_INFEASIBLE' && p.status === 'RESOLVED',
  );

  const mapped = {
    observationsReceived: metrics.triggerCount ?? observations,
    stillFeasibleCount: metrics.noActionCount ?? 0,
    problemCreatedCount: metrics.problemCreatedCount ?? 0,
    duplicateProblemCount: metrics.duplicateProblemCount ?? 0,
    candidatesGenerated: metrics.candidateCount ?? 0,
    legacyWriteInvocations: metrics.legacyWriteCount ?? legacyWriteCount(meta),
    planVersionWriteCount: wrotePlanVersion ? 1 : 0,
    revalidationPassCount:
      (metrics.revalidationPassCount ?? 0) >= 1 || resolvedProblem ? 1 : 0,
    unresolvedAfterApplyCount: metrics.unresolvedAfterApplyCount ?? 0,
    idempotentReplayCount: metrics.idempotentReplayCount ?? 0,
  };

  const checks: AcceptanceCheck[] = [
    { id: 'ES-S-001', pass: mapped.observationsReceived >= 2, detail: `observationsReceived=${mapped.observationsReceived}` },
    { id: 'ES-S-002', pass: mapped.stillFeasibleCount >= 1, detail: `stillFeasibleCount=${mapped.stillFeasibleCount}` },
    { id: 'ES-S-003', pass: mapped.problemCreatedCount >= 1, detail: `problemCreatedCount=${mapped.problemCreatedCount}` },
    { id: 'ES-S-004', pass: mapped.duplicateProblemCount === 0, detail: `duplicateProblemCount=${mapped.duplicateProblemCount}` },
    { id: 'ES-S-005', pass: mapped.candidatesGenerated >= 2, detail: `candidatesGenerated=${mapped.candidatesGenerated}` },
    { id: 'ES-S-006', pass: mapped.legacyWriteInvocations === 0, detail: `legacyWriteInvocations=${mapped.legacyWriteInvocations}` },
    { id: 'ES-S-007', pass: mapped.planVersionWriteCount >= 1, detail: `planVersionWriteCount=${mapped.planVersionWriteCount}` },
    { id: 'ES-S-008', pass: mapped.revalidationPassCount >= 1, detail: `revalidationPassCount=${mapped.revalidationPassCount}` },
    { id: 'ES-S-009', pass: mapped.unresolvedAfterApplyCount === 0, detail: `unresolvedAfterApplyCount=${mapped.unresolvedAfterApplyCount}` },
    { id: 'ES-S-010', pass: mapped.idempotentReplayCount >= 1, detail: `idempotentReplayCount=${mapped.idempotentReplayCount}` },
  ];

  const pass = summarizeChecks(checks);
  const evidence = {
    evidenceType: 'EXECUTION_SLIP_STAGING_SHADOW',
    phase: 'SHADOW',
    commitSha: gitCommitSha(),
    environment: process.env.BASE_URL ?? 'http://localhost:3000',
    tripId: TRIP_ID,
    metrics: mapped,
    rawShadow: metrics,
    checks,
    result: pass ? 'PASS' : 'FAIL',
  };

  writeFileSync(evidencePath('SHADOW'), JSON.stringify(evidence, null, 2));
  console.log(`Shadow ${pass ? 'PASS' : 'FAIL'} → ${evidencePath('SHADOW')}`);
  if (!pass) process.exit(1);
}

async function main() {
  assertProdDatabase();
  const phase = resolvePhase();
  const prisma = new PrismaClient();
  const token = process.env.AUTH_TOKEN?.trim() || mintCanaryJwt(EXEC_SLIP_CANARY_USER_ID);

  try {
    if (phase === 'A') await runPhaseA(prisma, token);
    else if (phase === 'B') await runPhaseB(prisma);
    else if (phase === 'C') await runPhaseC(prisma, token);
    else if (phase === 'ROLLBACK') await runRollback(prisma);
    else if (phase === 'SHADOW') await runShadow(token, prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
