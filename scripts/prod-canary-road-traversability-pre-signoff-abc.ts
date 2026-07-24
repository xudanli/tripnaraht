#!/usr/bin/env npx tsx
/**
 * Traversability T2 — Phase A/B/C on tripnara_prod (LIMITED replay only).
 *
 * Skeleton: structural checks run today; traversability semantics (RT-A-002, RT-B-001)
 * are marked t1Pending until assessRoadTraversability + Abu LIMITED branch ship.
 *
 * Usage:
 *   ROAD_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-road-traversability-pre-signoff-abc.ts
 *   ROAD_DRILL_ALLOW_PROD=1 npx tsx scripts/prod-canary-road-traversability-pre-signoff-abc.ts --vehicle=4WD --phase=A
 */
import 'reflect-metadata';
import { createHash } from 'crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient } from '@prisma/client';
import { ORIGINAL_CANDIDATE_ID } from '../src/trips/guardian-decision-core/adapters/repair-candidate.adapter';
import { buildPlanVersionIdempotencyKey } from '../src/trips/guardian-decision-core/plan-version/plan-version.service';
import { GagnaveitaCollectorIngestService } from '../src/trips/guardian-decision-core/evidence/gagnaveita-collector-ingest.service';
import { GagnaveitaCollectorReplayStoreService } from '../src/trips/guardian-decision-core/evidence/gagnaveita-collector-replay.store';
import { GagnaveitaCollectorCanonicalService } from '../src/trips/guardian-decision-core/evidence/gagnaveita-collector-canonical.service';
import { GagnaveitaRoadEvidenceStoreService } from '../src/trips/guardian-decision-core/evidence/gagnaveita-road-evidence.store';
import { EvidenceResolverService } from '../src/trips/guardian-decision-core/evidence/evidence-resolver.service';
import { WorldStateStoreService } from '../src/trips/guardian-decision-core/evidence/world-state-store.service';
import { signGagnaveitaCollectorRequest } from '../src/trips/guardian-decision-core/evidence/gagnaveita-collector-signature.util';
import type { GagnaveitaEvidenceIngestRequest } from '../src/trips/guardian-decision-core/contracts/gagnaveita-evidence-ingest.types';
import type { GagnaveitaRealShapeFixture } from '../src/trips/guardian-decision-core/evidence/gagnaveita-faerd.mapper';
import type { ResolveRoadStatusChangedResult } from '../src/trips/guardian-decision-core/evidence/evidence-resolver.service';
import type { RoadStatusAssertionPayload } from '../src/trips/guardian-decision-core/adapters/road-status-to-assertion.adapter';
import { RFC001_EVIDENCE_RESOLVER_VERSION } from '../src/trips/guardian-decision-core/config/rfc001-iceland.config';
import {
  isProductionCanaryProblemVisibleToUser,
  resolveIcelandProductionCanaryPhase,
} from '../src/decision-runtime/config/iceland-canary-production.config';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { Rfc001RepairCandidate } from '../src/trips/guardian-decision-core/contracts/guardian-outputs.types';
import {
  assessRoadTraversability,
  f208ReferenceProfile,
} from '../src/trips/guardian-decision-core/assessment/road-traversability.assessor';
import type { TraversabilityResult } from '../src/trips/guardian-decision-core/assessment/road-traversability.types';
import {
  DEFAULT_LIMITED_FIXTURE,
  EVIDENCE_DIR,
  ROAD_CANARY_INITIAL_PLAN_ID,
  ROAD_CANARY_TRIP_ID,
  ROAD_CANARY_USER_ID,
  ROAD_TRAVERSABILITY_REPLAY_LIVE_SOURCE,
  TRAVERSABILITY_DRILL_STATUS,
  TRAVERSABILITY_EVIDENCE_LABEL,
  TRAVERSABILITY_GO_STATUS,
  WEATHER_CANARY_TRIP_ID,
} from './prod-canary-road-traversability-pre-signoff.constants';
import {
  TraversabilityAcceptanceCheck,
  applyRoadDrillEnv,
  arg,
  assertProdDatabase,
  buildProdHarnessStack,
  countT1Pending,
  fixtureSha256,
  newReplayRequestId,
  parseVehicleProfile,
  roadBindings,
  summarizeStructuralChecks,
  today,
  vehicleCapability,
} from './prod-canary-road-traversability-pre-signoff.util';

function requireSecret(): string {
  const secret =
    process.env.GAGNAVEITA_COLLECTOR_HMAC_SECRET?.trim() ??
    process.env.VEDUR_COLLECTOR_HMAC_SECRET?.trim();
  if (!secret) {
    throw new Error('missing GAGNAVEITA_COLLECTOR_HMAC_SECRET or VEDUR_COLLECTOR_HMAC_SECRET');
  }
  return secret;
}

function patchFixtureTimestamps(fixture: GagnaveitaRealShapeFixture): GagnaveitaRealShapeFixture {
  const now = new Date().toISOString();
  return {
    ...fixture,
    fixtureMeta: {
      ...fixture.fixtureMeta,
      fetchedAt: now,
      replayObservedAtPatched: now,
      replay: true,
      live: false,
    },
    gagnaveitaRecords: fixture.gagnaveitaRecords.map((record) => ({
      ...record,
      DagsKeyrtUt: now,
      DagsSkrad: now,
    })),
  };
}

function loadFixturePayload(fixturePath: string): { payload: string; fixture: GagnaveitaRealShapeFixture } {
  const raw = readFileSync(fixturePath, 'utf8');
  const parsed = patchFixtureTimestamps(JSON.parse(raw) as GagnaveitaRealShapeFixture);
  return { payload: JSON.stringify(parsed.gagnaveitaRecords), fixture: parsed };
}

async function buildIngestService(prisma: PrismaClient) {
  const prismaService = prisma as unknown as PrismaService;
  const replayStore = new GagnaveitaCollectorReplayStoreService(prismaService);
  const roadStore = new GagnaveitaRoadEvidenceStoreService(prismaService);
  const worldStore = new WorldStateStoreService(prismaService);
  const evidenceResolver = new EvidenceResolverService(worldStore);
  const canonical = new GagnaveitaCollectorCanonicalService(roadStore, evidenceResolver, worldStore);
  return new GagnaveitaCollectorIngestService(prismaService, replayStore, canonical);
}

async function ingestReplayFixture(
  prisma: PrismaClient,
  fixturePath: string,
): Promise<{ ingestResponse: unknown; fixture: GagnaveitaRealShapeFixture }> {
  const secret = requireSecret();
  process.env.GAGNAVEITA_COLLECTOR_ALLOWED_IDS =
    process.env.GAGNAVEITA_COLLECTOR_ALLOWED_IDS ?? 'gagnaveita-collector-pilot,vedur-collector-pilot';

  const { payload, fixture } = loadFixturePayload(fixturePath);
  const payloadSha256 = createHash('sha256').update(payload).digest('hex');
  const requestId = newReplayRequestId('road_traversability');
  const signatureTimestamp = new Date().toISOString();

  const body: GagnaveitaEvidenceIngestRequest = {
    schemaVersion: 'gagnaveita.raw.v1',
    tripId: ROAD_CANARY_TRIP_ID,
    roadId: 'F208',
    provider: 'vegagerdin_gagnaveita',
    collectorId: 'gagnaveita-collector-pilot',
    collectorRegion: 'road-traversability-drill',
    fetchedAt: new Date().toISOString(),
    sourceObservedAt: fixture.fixtureMeta.fetchedAt,
    contentType: 'application/json',
    payload,
    payloadSha256,
    requestId,
    signatureTimestamp,
    signature: '',
    replayMode: 'GAGNAVEITA_REAL_PAYLOAD_REPLAY',
  };
  body.signature = signGagnaveitaCollectorRequest(body, secret);

  const ingest = await buildIngestService(prisma);
  const ingestResponse = await ingest.ingest(body);
  return { ingestResponse, fixture };
}

async function buildResolvedEvidenceAfterIngest(
  stack: ReturnType<typeof buildProdHarnessStack>,
): Promise<ResolveRoadStatusChangedResult> {
  const store = await stack.worldStore.readStore(ROAD_CANARY_TRIP_ID);
  const assertion = [...store.assertions]
    .reverse()
    .find((a) => a.predicate === 'road.status' && a.status === 'ACTIVE') as
    | ResolveRoadStatusChangedResult['assertion']
    | undefined;
  if (!assertion) throw new Error('missing ACTIVE road.status assertion after ingest');

  const event = [...store.events]
    .reverse()
    .find((e) => e.eventType === 'ROAD_STATUS_CHANGED') as
    | ResolveRoadStatusChangedResult['event']
    | undefined;
  if (!event) throw new Error('missing ROAD_STATUS_CHANGED event after ingest');

  const snapshot =
    store.snapshots.find((s) => s.assertionIds.includes(assertion.assertionId)) ??
    store.snapshots[store.snapshots.length - 1];
  if (!snapshot) throw new Error('missing world state snapshot after ingest');

  return {
    event,
    assertion,
    snapshot,
    resolverVersion: RFC001_EVIDENCE_RESOLVER_VERSION,
    hardClosure: (assertion.payload as RoadStatusAssertionPayload).status === 'CLOSED',
    supersededAssertionIds: [],
  };
}

function selectExecuteCandidate(
  candidates: Rfc001RepairCandidate[],
  executableIds: Set<string>,
): string {
  const executable = candidates.filter((c) => executableIds.has(c.candidateId));
  const score = (c: Rfc001RepairCandidate): number => {
    const kinds = new Set(c.proposedOperations.map((op) => op.kind));
    if (kinds.has('REPLACE_ITEM')) return 90;
    if (kinds.has('CHANGE_ROUTE') && kinds.has('REMOVE_ITEM')) return 85;
    if (kinds.has('REMOVE_ITEM')) return 70;
    if (kinds.has('CHANGE_ROUTE')) return 60;
    return 50;
  };
  const ranked = [...executable].sort((a, b) => score(b) - score(a));
  const picked = ranked[0];
  if (!picked) throw new Error('no executable candidate for EXECUTE phase');
  return picked.candidateId;
}

async function runPhaseA(
  prisma: PrismaClient,
  fixturePath: string,
  vehicleProfile: ReturnType<typeof parseVehicleProfile>,
) {
  applyRoadDrillEnv('OBSERVE');
  const capability = vehicleCapability(vehicleProfile);
  const startedAt = new Date().toISOString();
  const stack = buildProdHarnessStack(prisma);
  const bindings = roadBindings();

  const { ingestResponse, fixture } = await ingestReplayFixture(prisma, fixturePath);
  const resolved = await buildResolvedEvidenceAfterIngest(stack);
  const pipeline = await stack.pipeline.runFromResolvedEvidence(
    ROAD_CANARY_TRIP_ID,
    resolved,
    { bindings },
  );
  const world = await stack.worldStore.readStore(ROAD_CANARY_TRIP_ID);
  const assertion = world.assertions.find((a) => a.predicate === 'road.status');
  const assertionStatus = (assertion?.payload as { status?: string })?.status;
  const openProblems = (await stack.problemStore.list(ROAD_CANARY_TRIP_ID)).filter(
    (p) => p.status === 'OPEN',
  );
  const effectiveBefore = await stack.planVersionStore.getEffectivePlanVersionId(ROAD_CANARY_TRIP_ID);

  let lineageCount = 0;
  if (pipeline.problem) {
    const view = await stack.readModel.getProblemView(ROAD_CANARY_TRIP_ID, pipeline.problem.problemId);
    lineageCount = view.lineage.length;
  }

  const userVisible = isProductionCanaryProblemVisibleToUser(
    ROAD_CANARY_TRIP_ID,
    ROAD_CANARY_USER_ID,
  );

  const expectedAssessorResult: TraversabilityResult =
    vehicleProfile === '2WD' ? 'VEHICLE_INCOMPATIBLE' : 'PASSABLE_WITH_CAUTION';
  const assessor = assessRoadTraversability({
    roadProfile: f208ReferenceProfile(),
    liveCondition: {
      status: (assertionStatus as 'LIMITED' | 'CLOSED' | 'OPEN' | 'UNKNOWN') ?? 'UNKNOWN',
      condition: 'NORMAL',
      observedAt: new Date().toISOString(),
      sourceProvider: 'vegagerdin_gagnaveita',
    },
    weather: { precipitation: 'none' },
    vehicle: {
      driveType: capability.driveType,
      vehicleClass: capability.vehicleClass,
      riverCrossingAllowed: capability.riverCrossingAllowed,
    },
    driverProfile: { gravelRoadExperience: capability.gravelRoadExperience },
    tripContext: { tripId: ROAD_CANARY_TRIP_ID, destination: 'IS' },
  });

  const checks: TraversabilityAcceptanceCheck[] = [
    {
      id: 'RT-A-001',
      scenarioId: capability.scenarioId,
      pass: assertionStatus === 'LIMITED',
      detail: `assertion.status=${assertionStatus ?? 'missing'} (expect LIMITED, not CLOSED)`,
    },
    {
      id: 'RT-A-002',
      scenarioId: capability.scenarioId,
      pass: assessor.result === expectedAssessorResult,
      detail: `assessor.result=${assessor.result} gate=${assessor.gate} (expect ${expectedAssessorResult})`,
    },
    {
      id: 'RT-A-003',
      scenarioId: capability.scenarioId,
      pass: openProblems.length === 1,
      detail: `openProblems=${openProblems.length}`,
    },
    {
      id: 'RT-A-004',
      scenarioId: capability.scenarioId,
      pass: lineageCount >= 3,
      detail: `lineageNodes=${lineageCount} (RT1-RT3 nodes after T1)`,
    },
    {
      id: 'RT-A-005',
      scenarioId: capability.scenarioId,
      pass: effectiveBefore === ROAD_CANARY_INITIAL_PLAN_ID,
      detail: `effectivePlan=${effectiveBefore ?? 'missing'}`,
    },
    {
      id: 'RT-A-006',
      scenarioId: capability.scenarioId,
      pass: userVisible === false,
      detail: `userVisible=${userVisible}`,
    },
    {
      id: 'RT-A-007',
      scenarioId: capability.scenarioId,
      pass: assertionStatus !== 'CLOSED',
      detail: 'fixture must not be CLOSED replay (traversability/LIMITED only)',
    },
    {
      id: 'RT-A-008',
      scenarioId: capability.scenarioId,
      pass: fixture.fixtureMeta.replay !== false,
      detail: 'replay=true live=false sourceProvider=vegagerdin_gagnaveita',
    },
  ];

  const structuralPass = summarizeStructuralChecks(checks);
  const evidence = {
    evidenceType: 'ROAD_TRAVERSABILITY_PRE_SIGNOFF_A_OBSERVE',
    evidenceLabel: TRAVERSABILITY_EVIDENCE_LABEL,
    drillDefinition: 'Prod Canary Road Traversability T2 Pre-Signoff Drill',
    drillStatus: TRAVERSABILITY_DRILL_STATUS,
    productionCanaryGoStatus: TRAVERSABILITY_GO_STATUS,
    acceptanceMode: 'TRAVERSABILITY_REPLAY_SKELETON',
    replay: true,
    live: false,
    sourceProvider: 'vegagerdin_gagnaveita',
    liveSource: ROAD_TRAVERSABILITY_REPLAY_LIVE_SOURCE,
    vehicleProfile,
    scenarioId: capability.scenarioId,
    rfc001VehicleCapability: capability,
    startedAt,
    endedAt: new Date().toISOString(),
    tripId: ROAD_CANARY_TRIP_ID,
    userId: ROAD_CANARY_USER_ID,
    weatherCanaryTripId: WEATHER_CANARY_TRIP_ID,
    phase: 'OBSERVE',
    canaryPhase: resolveIcelandProductionCanaryPhase(),
    problemId: pipeline.problem?.problemId ?? null,
    ingestResponse,
    assessor,
    fixture: fixturePath,
    fixtureMeta: fixture.fixtureMeta,
    checks,
    t1PendingCount: countT1Pending(checks),
    assessorResult: assessor.result,
    assessorGate: assessor.gate,
    structuralResult: structuralPass ? 'PASS' : 'FAIL',
    traversabilityResult:
      assessor.result === expectedAssessorResult ? 'ASSESSOR_PASS' : 'ASSESSOR_FAIL',
    result: structuralPass ? 'SKELETON_PASS' : 'FAIL',
  };

  return { structuralPass, evidence, problemId: pipeline.problem?.problemId ?? null };
}

async function runPhaseB(
  prisma: PrismaClient,
  problemId: string,
  vehicleProfile: ReturnType<typeof parseVehicleProfile>,
) {
  applyRoadDrillEnv('SUGGEST');
  const capability = vehicleCapability(vehicleProfile);
  const startedAt = new Date().toISOString();
  const stack = buildProdHarnessStack(prisma);
  const bindings = roadBindings();

  const run = await stack.runner.evaluateAndFinalizeByProblemId(
    ROAD_CANARY_TRIP_ID,
    problemId,
    { bindings },
  );

  const effectiveBefore = await stack.planVersionStore.getEffectivePlanVersionId(ROAD_CANARY_TRIP_ID);
  const originalBlock = run.workspace?.constraintAssertions.find(
    (a) => a.targetCandidateId === ORIGINAL_CANDIDATE_ID && a.verdict === 'BLOCK',
  );
  const originalWarn = run.workspace?.constraintAssertions.find(
    (a) =>
      a.targetCandidateId === ORIGINAL_CANDIDATE_ID &&
      (a.verdict === 'WARNING' || a.verdict === 'WARN'),
  );
  const bypassCandidate = run.workspace?.repairCandidates.find(
    (c) => c.generationMethod === 'ROUTE_REPAIR',
  );
  const view = await stack.readModel.getProblemView(ROAD_CANARY_TRIP_ID, problemId);
  const executableCount = view.options.filter((o) => o.executable).length;
  const executableIds = new Set(view.options.filter((o) => o.executable).map((o) => o.id));

  const expectBlockOn2wd = vehicleProfile === '2WD';
  const originalAbu = run.workspace?.constraintAssertions.find(
    (a) => a.targetCandidateId === ORIGINAL_CANDIDATE_ID && a.actor === 'ABU',
  );
  const checks: TraversabilityAcceptanceCheck[] = [
    {
      id: 'RT-B-001',
      scenarioId: capability.scenarioId,
      pass: expectBlockOn2wd ? Boolean(originalBlock) : Boolean(originalWarn),
      detail: expectBlockOn2wd
        ? `originalBlock=${originalBlock?.verdict ?? 'missing'} constraint=${originalAbu?.constraintCode ?? 'n/a'}`
        : `originalWarn=${originalWarn?.verdict ?? originalBlock?.verdict ?? 'missing'} constraint=${originalAbu?.constraintCode ?? 'n/a'}`,
    },
    {
      id: 'RT-B-002',
      scenarioId: capability.scenarioId,
      pass: expectBlockOn2wd
        ? Boolean(originalBlock) && executableCount >= 1
        : Boolean(originalWarn) && !originalBlock,
      detail: `gate=${expectBlockOn2wd ? 'SUGGEST_REPLACE' : 'NEED_CONFIRM'} executable=${executableCount}`,
    },
    {
      id: 'RT-B-003',
      scenarioId: capability.scenarioId,
      pass: executableCount >= 1,
      detail: `executable=${executableCount}`,
    },
    {
      id: 'RT-B-004',
      scenarioId: capability.scenarioId,
      pass: Boolean(bypassCandidate),
      detail: bypassCandidate
        ? `bypass=${bypassCandidate.candidateId} method=${bypassCandidate.generationMethod}`
        : 'bypass candidate missing',
    },
    {
      id: 'RT-B-005',
      scenarioId: capability.scenarioId,
      pass: effectiveBefore === ROAD_CANARY_INITIAL_PLAN_ID,
      detail: `effectivePlan=${effectiveBefore ?? 'missing'}`,
    },
  ];

  const structuralPass = summarizeStructuralChecks(checks);
  const selectedCandidateId = selectExecuteCandidate(
    run.workspace?.repairCandidates ?? [],
    executableIds,
  );

  const evidence = {
    evidenceType: 'ROAD_TRAVERSABILITY_PRE_SIGNOFF_B_SUGGEST',
    evidenceLabel: TRAVERSABILITY_EVIDENCE_LABEL,
    drillDefinition: 'Prod Canary Road Traversability T2 Pre-Signoff Drill',
    drillStatus: TRAVERSABILITY_DRILL_STATUS,
    productionCanaryGoStatus: TRAVERSABILITY_GO_STATUS,
    acceptanceMode: 'TRAVERSABILITY_REPLAY_SKELETON',
    replay: true,
    live: false,
    sourceProvider: 'vegagerdin_gagnaveita',
    liveSource: ROAD_TRAVERSABILITY_REPLAY_LIVE_SOURCE,
    vehicleProfile,
    scenarioId: capability.scenarioId,
    startedAt,
    endedAt: new Date().toISOString(),
    tripId: ROAD_CANARY_TRIP_ID,
    phase: 'SUGGEST',
    problemId,
    decisionId: run.record?.decisionId ?? null,
    repairCount: run.workspace?.repairCandidates.length ?? 0,
    selectedCandidateId,
    checks,
    t1PendingCount: countT1Pending(checks),
    structuralResult: structuralPass ? 'PASS' : 'FAIL',
    traversabilityResult: structuralPass ? 'ABU_WIRED' : 'FAIL',
    result: structuralPass ? 'SKELETON_PASS' : 'FAIL',
  };

  return {
    structuralPass,
    evidence,
    decisionId: run.record?.decisionId ?? null,
    selectedCandidateId,
  };
}

async function runPhaseC(
  prisma: PrismaClient,
  problemId: string,
  decisionId: string,
  selectedCandidateId: string,
  vehicleProfile: ReturnType<typeof parseVehicleProfile>,
) {
  applyRoadDrillEnv('EXECUTE');
  const capability = vehicleCapability(vehicleProfile);
  const startedAt = new Date().toISOString();
  const stack = buildProdHarnessStack(prisma);

  const effectiveBefore = await stack.planVersionStore.getEffectivePlanVersionId(ROAD_CANARY_TRIP_ID);

  await stack.authorization.authorize({
    tripId: ROAD_CANARY_TRIP_ID,
    decisionId,
    choice: selectedCandidateId,
  });

  const key = buildPlanVersionIdempotencyKey(ROAD_CANARY_TRIP_ID, decisionId);
  const first = await stack.executor.execute({
    tripId: ROAD_CANARY_TRIP_ID,
    decisionId,
    idempotencyKey: key,
  });

  const effectiveAfter = await stack.planVersionStore.getEffectivePlanVersionId(ROAD_CANARY_TRIP_ID);
  const problem = await stack.problemStore.get(ROAD_CANARY_TRIP_ID, problemId);
  const appliedPlan = first.planVersion;
  const usesF208 =
    appliedPlan?.operations?.some((op) =>
      JSON.stringify(op.parameters ?? {}).includes('F208'),
    ) ?? false;

  const checks: TraversabilityAcceptanceCheck[] = [
    {
      id: 'RT-C-001',
      scenarioId: capability.scenarioId,
      pass: first.record.recordStatus === 'EFFECTIVE',
      detail: `recordStatus=${first.record.recordStatus}`,
    },
    {
      id: 'RT-C-002',
      scenarioId: capability.scenarioId,
      pass: !usesF208,
      detail: `f208InAppliedPlan=${usesF208}`,
    },
    {
      id: 'RT-C-003',
      scenarioId: capability.scenarioId,
      pass: effectiveAfter !== effectiveBefore,
      detail: `effectiveBefore=${effectiveBefore ?? 'none'} effectiveAfter=${effectiveAfter ?? 'none'}`,
    },
    {
      id: 'RT-C-004',
      scenarioId: capability.scenarioId,
      pass: problem?.status === 'RESOLVED',
      detail: `problemStatus=${problem?.status ?? 'missing'}`,
    },
  ];

  const structuralPass = summarizeStructuralChecks(checks);
  const evidence = {
    evidenceType: 'ROAD_TRAVERSABILITY_PRE_SIGNOFF_C_EXECUTE',
    evidenceLabel: TRAVERSABILITY_EVIDENCE_LABEL,
    drillDefinition: 'Prod Canary Road Traversability T2 Pre-Signoff Drill',
    drillStatus: TRAVERSABILITY_DRILL_STATUS,
    productionCanaryGoStatus: TRAVERSABILITY_GO_STATUS,
    acceptanceMode: 'TRAVERSABILITY_REPLAY_SKELETON',
    replay: true,
    live: false,
    vehicleProfile,
    scenarioId: capability.scenarioId,
    startedAt,
    endedAt: new Date().toISOString(),
    tripId: ROAD_CANARY_TRIP_ID,
    phase: 'EXECUTE',
    problemId,
    decisionId,
    selectedOptionId: selectedCandidateId,
    effectivePlanVersionId: effectiveAfter ?? null,
    checks,
    structuralResult: structuralPass ? 'PASS' : 'FAIL',
    result: structuralPass ? 'SKELETON_PASS' : 'FAIL',
  };

  return { structuralPass, evidence };
}

async function main() {
  assertProdDatabase();
  if (process.env.ROAD_DRILL_ALLOW_PROD !== '1') {
    throw new Error(
      'Set ROAD_DRILL_ALLOW_PROD=1 to run road traversability drill on tripnara_prod',
    );
  }

  const fixturePath = arg('fixture', DEFAULT_LIMITED_FIXTURE)!;
  const phase = (arg('phase', 'ALL') ?? 'ALL').toUpperCase();
  const vehicleProfile = parseVehicleProfile();
  const skipExecute = process.argv.includes('--skip-execute');
  const prisma = new PrismaClient();

  try {
    const trip = await prisma.trip.findUnique({
      where: { id: ROAD_CANARY_TRIP_ID },
      select: { id: true, metadata: true },
    });
    if (!trip) {
      throw new Error('Road canary trip missing — run prod-canary-road-traversability-pre-signoff-setup.ts first');
    }

    const metaVehicle = (trip.metadata as Record<string, unknown>)?.roadTraversabilityDrill as
      | { vehicleProfile?: string }
      | undefined;
    if (metaVehicle?.vehicleProfile && metaVehicle.vehicleProfile !== vehicleProfile) {
      console.warn(
        `WARN: trip seeded for vehicle=${metaVehicle.vehicleProfile} but drill run with --vehicle=${vehicleProfile}`,
      );
    }

    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const date = today();
    const suffix = vehicleProfile.toLowerCase();
    const results: Record<string, unknown> = {
      suiteId: `road-traversability-pre-signoff-${suffix}-${date}`,
      evidenceLabel: TRAVERSABILITY_EVIDENCE_LABEL,
      drillDefinition: 'Prod Canary Road Traversability T2 Pre-Signoff Drill',
      drillStatus: TRAVERSABILITY_DRILL_STATUS,
      productionCanaryGoStatus: TRAVERSABILITY_GO_STATUS,
      t1Readiness: 'PENDING_ASSESSOR',
      generatedAt: new Date().toISOString(),
      vehicleProfile,
      scenarioId: vehicleCapability(vehicleProfile).scenarioId,
      replay: true,
      live: false,
      sourceProvider: 'vegagerdin_gagnaveita',
      liveSource: ROAD_TRAVERSABILITY_REPLAY_LIVE_SOURCE,
      fixture: { path: fixturePath, sha256: fixtureSha256(fixturePath) },
      phases: {} as Record<string, unknown>,
      structuralVerdict: 'PASS',
      traversabilityVerdict: 'PENDING_T1',
    };

    let problemId = arg('problem-id');
    let decisionId = arg('decision-id');
    let selectedCandidateId = arg('candidate-id');

    if (phase === 'A' || phase === 'ALL') {
      const a = await runPhaseA(prisma, fixturePath, vehicleProfile);
      (results.phases as Record<string, unknown>).A = a.evidence;
      if (!a.structuralPass) results.structuralVerdict = 'FAIL';
      problemId = a.problemId ?? problemId;
      writeFileSync(
        join(EVIDENCE_DIR, `road-traversability-observe-a-${suffix}-${date}.json`),
        JSON.stringify(a.evidence, null, 2),
      );
      if (phase === 'A') {
        console.log(JSON.stringify(a.evidence, null, 2));
        process.exit(a.structuralPass ? 0 : 1);
      }
    }

    if (!problemId) throw new Error('Phase B/C requires problemId from Phase A');

    if (phase === 'B' || phase === 'ALL') {
      const b = await runPhaseB(prisma, problemId, vehicleProfile);
      (results.phases as Record<string, unknown>).B = b.evidence;
      if (!b.structuralPass) results.structuralVerdict = 'FAIL';
      decisionId = b.decisionId ?? decisionId;
      selectedCandidateId = b.selectedCandidateId;
      writeFileSync(
        join(EVIDENCE_DIR, `road-traversability-suggest-b-${suffix}-${date}.json`),
        JSON.stringify(b.evidence, null, 2),
      );
      if (phase === 'B') {
        console.log(JSON.stringify(b.evidence, null, 2));
        process.exit(b.structuralPass ? 0 : 1);
      }
    }

    if (!skipExecute && (phase === 'C' || phase === 'ALL')) {
      if (!decisionId) throw new Error('Phase C requires decisionId from Phase B');
      if (!selectedCandidateId) throw new Error('Phase C requires selectedCandidateId from Phase B');

      const c = await runPhaseC(prisma, problemId, decisionId, selectedCandidateId, vehicleProfile);
      (results.phases as Record<string, unknown>).C = c.evidence;
      if (!c.structuralPass) results.structuralVerdict = 'FAIL';
      writeFileSync(
        join(EVIDENCE_DIR, `road-traversability-execute-c-${suffix}-${date}.json`),
        JSON.stringify(c.evidence, null, 2),
      );
    } else if (skipExecute) {
      (results.phases as Record<string, unknown>).C = { skipped: true, reason: '--skip-execute' };
    }

    const suitePath = join(EVIDENCE_DIR, `road-traversability-pre-signoff-${suffix}-${date}.json`);
    writeFileSync(suitePath, JSON.stringify(results, null, 2));

    console.log(JSON.stringify(results, null, 2));
    console.log(`\nWritten suite: ${suitePath}`);
    console.log(`\n=== structuralVerdict: ${results.structuralVerdict} ===`);
    console.log(`=== traversabilityVerdict: ${results.traversabilityVerdict} ===`);
    console.log(TRAVERSABILITY_GO_STATUS);

    if (results.structuralVerdict !== 'PASS') process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
