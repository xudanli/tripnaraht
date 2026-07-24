#!/usr/bin/env npx tsx
/**
 * Runtime smoke: PILOT-IS-02 road / 03 weather / 04 slip→daylight (+ REMOVE).
 *
 * Prerequisite:
 *   npm run tep:pilot-seed -- --template=all --reset
 *
 * Usage:
 *   npm run tep:pilot-runtime-smoke -- --template=02
 *   npm run tep:pilot-runtime-smoke -- --template=03
 *   npm run tep:pilot-runtime-smoke -- --template=04
 *   npm run tep:pilot-runtime-smoke -- --template=all
 */
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import { resolveTripDestinationCountry } from '../src/decision-runtime/packs/loader/country-pack-registry.util';
import type { RecoveryOption } from '../src/trips/tep/contracts/tep-self-drive.types';
import { projectRecoveryGraph } from '../src/trips/tep/projectors/recovery-graph.projector';
import { resolveSelfDriveProfile } from '../src/trips/tep/resolvers/self-drive-profile.resolver';
import { validateTepPlanningSnapshot } from '../src/trips/tep/validation/tep-validator';
import {
  buildExecutionSlipDaylightArrivals,
  computeDaylightViolationMinutes,
} from '../src/trips/tep/utils/daylight-violation-minutes.util';
import { resolveItineraryItemIdFromActivityRef } from '../src/trips/tep/utils/tep-repair-intervention.util';
import {
  PILOT_IS_02_PLAN_VERSION_ID,
  PILOT_IS_02_TRIP_ID,
  PILOT_IS_03_PLAN_VERSION_ID,
  PILOT_IS_03_TRIP_ID,
  PILOT_IS_04_ITEM_STOP,
  PILOT_IS_04_PLAN_VERSION_ID,
  PILOT_IS_04_TRIP_ID,
  TEP_PILOT_USER_ID,
} from './tep-pilot-is-seed.constants';
import {
  assertSafeDatabase,
  buildPilotWritebackStack,
  loadProjectEnv,
  parseEnvProfile,
  projectDailyDrivePlansForTrip,
  readSeededRecoveryGraph,
} from './tep-pilot-smoke.util';
import {
  buildIsCert404CanonicalProblem,
  buildIsCert404RoadHook,
  buildIsCert404TepProblem,
} from '../src/trips/tep/certification/is-cert-404.harness';
import { loadIsCertRuntimeScenariosFromFile } from '../src/trips/tep/certification/is-cert-runtime.harness';
import type { ExecutionAdjustmentQueueDto, ExecutionInterventionDto } from '../src/mobile/dto/mobile-execution.types';
import { TepErcBridgeService } from '../src/trips/tep/services/tep-erc-bridge.service';
import {
  buildPilotRuntimeStack,
  readPilotRuntimeHints,
} from './tep-pilot-runtime-smoke.util';

export type TepPilotRuntimeSmokeTemplate = '02' | '03' | '04' | 'all';

function parseRuntimeTemplate(argv: string[]): TepPilotRuntimeSmokeTemplate {
  const hit = argv.find((a) => a.startsWith('--template='));
  const raw = hit?.split('=').slice(1).join('=') ?? 'all';
  if (raw === '02' || raw === '03' || raw === '04' || raw === 'all') return raw;
  throw new Error(`Unknown --template=${raw} (use 02|03|04|all)`);
}

function buildDaylightRemoveOption(targetRef: string, dayIndex: number): RecoveryOption {
  return {
    optionId: `REPAIR-SDR202-D${dayIndex}-${targetRef}`,
    triggerRuleId: 'SDR-202',
    action: 'REMOVE',
    targetRefs: [targetRef, `day_${dayIndex}`],
    description: '删除可选停靠以回收日照窗口（执行 slip 后）',
  };
}

function buildRoadDedupProbeQueue(
  tripId: string,
  tepProblemId: string,
  canonicalProblemId: string,
  targetRef: string,
): ExecutionAdjustmentQueueDto {
  const baseIntervention = (
    partial: Partial<ExecutionInterventionDto>,
  ): ExecutionInterventionDto => ({
    schemaId: 'tripnara.execution_intervention@v1',
    id: partial.id ?? 'intervention-x',
    tripId,
    type: partial.type ?? 'SAFETY_INTERVENTION',
    priority: partial.priority ?? 'CRITICAL',
    title: partial.title ?? '道路封闭',
    reason: partial.reason ?? '封路',
    recommendedAction: '调整路线',
    affectedMembers: [],
    affectedActivities: partial.affectedActivities ?? [],
    alternativeActions: [],
    evidenceRefs: [],
    requiresConfirmation: true,
    autoExecutable: false,
    reversible: true,
    modifiesEffectivePlan: false,
    requiresRevalidation: false,
    status: 'OPEN',
    linkedRiskIds: partial.linkedRiskIds ?? [],
    causalChain: {
      headline: partial.title ?? '道路封闭',
      assessment: partial.reason ?? '封路',
      nodes: [],
    },
    actions: {
      primary: { label: '查看', action: 'view_impact', enabled: true },
      secondary: { label: '确认', action: 'complete', enabled: true },
      defer: { label: '稍后', action: 'defer', enabled: true },
    },
    ...partial,
  });

  return {
    schemaId: 'tripnara.execution_adjustment_queue@v1',
    tripId,
    contextVersion: 1,
    projectionSource: 'execution_risk_center',
    pendingCount: 3,
    criticalCount: 2,
    highPriorityCount: 2,
    headline: '今天需要您决定 3 件事',
    items: [
      baseIntervention({
        id: `intervention-decision-${tepProblemId}`,
        decisionProblemId: tepProblemId,
        title: 'TEP 道路封闭（主问题）',
        affectedActivities: [targetRef],
      }),
      baseIntervention({
        id: `intervention-decision-${canonicalProblemId}`,
        decisionProblemId: canonicalProblemId,
        title: 'Canonical 道路封闭（应被抑制）',
        affectedActivities: [targetRef],
      }),
      baseIntervention({
        id: 'intervention-risk-road-close',
        linkedRiskIds: ['risk_road_close_pilot'],
        affectedActivities: [targetRef],
        title: '风险层道路封闭（应被抑制）',
      }),
    ],
    countsByType: {
      SAFETY_INTERVENTION: 3,
      DYNAMIC_REPLAN: 0,
      TEAM_COORDINATION: 0,
      EXECUTION_PREPARATION: 0,
    },
  };
}

export async function runPilotIs02DedupQueueSmoke(
  prisma: PrismaClient,
): Promise<Record<string, unknown>> {
  const cert301 = loadIsCertRuntimeScenariosFromFile().find((s) => s.scenarioId === 'IS-CERT-301');
  if (!cert301) {
    throw new Error('IS-CERT-301 scenario missing for 404 dedup smoke');
  }

  const scenario = {
    ...cert301,
    input: {
      ...cert301.input,
      tripId: PILOT_IS_02_TRIP_ID,
      planVersionId: PILOT_IS_02_PLAN_VERSION_ID,
    },
  };

  const hook = buildIsCert404RoadHook(scenario);
  const tepProblem = buildIsCert404TepProblem(scenario, hook);
  const canonicalProblem = buildIsCert404CanonicalProblem(scenario, hook);

  const { planMetadata } = buildPilotRuntimeStack(prisma);
  const bridge = new TepErcBridgeService(planMetadata);
  const baseQueue = buildRoadDedupProbeQueue(
    PILOT_IS_02_TRIP_ID,
    tepProblem.problemId,
    canonicalProblem.problemId,
    hook.targetRef,
  );

  const enriched = await bridge.enrichAdjustmentQueue(PILOT_IS_02_TRIP_ID, baseQueue);
  const visible = enriched.items[0];

  const pass =
    enriched.items.length === 1 &&
    visible?.decisionProblemId === tepProblem.problemId &&
    baseQueue.items.length - enriched.items.length === 2;

  const output = {
    ok: pass,
    template: 'PILOT-IS-02-404',
    tripId: PILOT_IS_02_TRIP_ID,
    visibleCount: enriched.items.length,
    suppressedCount: baseQueue.items.length - enriched.items.length,
    primaryProblemId: visible?.decisionProblemId,
    expectedProblemId: tepProblem.problemId,
  };

  if (!pass) {
    throw new Error(`PILOT-IS-02 IS-CERT-404 dedup smoke failed: ${JSON.stringify(output)}`);
  }
  return output;
}

export async function runPilotIs02RoadRuntimeSmoke(
  prisma: PrismaClient,
): Promise<Record<string, unknown>> {
  const trip = await prisma.trip.findUnique({
    where: { id: PILOT_IS_02_TRIP_ID },
    select: { metadata: true },
  });
  if (!trip) {
    throw new Error(
      `Trip ${PILOT_IS_02_TRIP_ID} not found — run: npm run tep:pilot-seed -- --template=02 --reset`,
    );
  }

  const metadata =
    trip.metadata && typeof trip.metadata === 'object' && !Array.isArray(trip.metadata)
      ? (trip.metadata as Record<string, unknown>)
      : {};

  const hints = readPilotRuntimeHints(metadata);
  if (!hints?.currentObservation || !hints.previousObservation) {
    throw new Error('pilot_is_02 missing tepPilotRuntimeHints road observations');
  }

  const { runtimeTrigger, problemStore, planMetadata } = buildPilotRuntimeStack(prisma);
  const hooks = await planMetadata.loadDecisionHooks(PILOT_IS_02_TRIP_ID);
  const roadHook = hooks.find((h) => h.hookId.startsWith('HOOK-ROAD'));
  if (!roadHook) {
    throw new Error('No HOOK-ROAD on pilot_is_02 effective plan metadata');
  }

  const triggerEventId = hints.triggerEventId ?? 'evt_pilot_is_02_road';
  const result = await runtimeTrigger.processObservation({
    tripId: PILOT_IS_02_TRIP_ID,
    planVersionId: PILOT_IS_02_PLAN_VERSION_ID,
    triggerEventId,
    worldStateSnapshotId: hints.worldStateSnapshotId ?? 'ws_pilot_is_02',
    previousObservation: hints.previousObservation,
    currentObservation: hints.currentObservation,
  });

  const openProblems = await problemStore.list(PILOT_IS_02_TRIP_ID);
  const persisted = openProblems.find(
    (p) => p.triggerEventId === triggerEventId && p.status === 'OPEN',
  );

  const pass =
    result.matched === true &&
    result.transitioned === true &&
    result.problem?.semanticCapability === 'ROAD_SEGMENT_UNAVAILABLE' &&
    Boolean(persisted);

  const output = {
    ok: pass,
    template: 'PILOT-IS-02',
    tripId: PILOT_IS_02_TRIP_ID,
    hookId: result.hook?.hookId,
    problemId: result.problem?.problemId,
    semanticCapability: result.problem?.semanticCapability,
    transitioned: result.transitioned,
    persistedOpen: Boolean(persisted),
  };

  if (!pass) {
    throw new Error(`PILOT-IS-02 road runtime smoke failed: ${JSON.stringify(output)}`);
  }

  const dedup = await runPilotIs02DedupQueueSmoke(prisma);
  return { ...output, dedup404: dedup };
}

export async function runPilotIs03WeatherRuntimeSmoke(
  prisma: PrismaClient,
): Promise<Record<string, unknown>> {
  const trip = await prisma.trip.findUnique({
    where: { id: PILOT_IS_03_TRIP_ID },
    select: { metadata: true },
  });
  if (!trip) {
    throw new Error(
      `Trip ${PILOT_IS_03_TRIP_ID} not found — run: npm run tep:pilot-seed -- --template=03 --reset`,
    );
  }

  const metadata =
    trip.metadata && typeof trip.metadata === 'object' && !Array.isArray(trip.metadata)
      ? (trip.metadata as Record<string, unknown>)
      : {};

  const hints = readPilotRuntimeHints(metadata);
  if (!hints?.currentObservation || !hints.previousObservation) {
    throw new Error('pilot_is_03 missing tepPilotRuntimeHints weather observations');
  }

  const windAfter = Number(hints.currentObservation['weather.windSpeedKmh']);
  if (!Number.isFinite(windAfter) || windAfter < 90) {
    throw new Error(`Expected weather.windSpeedKmh >= 90 in hints, got ${windAfter}`);
  }

  const { runtimeTrigger, problemStore, planMetadata } = buildPilotRuntimeStack(prisma);
  const hooks = await planMetadata.loadDecisionHooks(PILOT_IS_03_TRIP_ID);
  const weatherHook = hooks.find((h) => h.hookId.startsWith('HOOK-WEATHER'));
  if (!weatherHook) {
    throw new Error('No HOOK-WEATHER on pilot_is_03 effective plan metadata');
  }

  const triggerEventId = hints.triggerEventId ?? 'evt_pilot_is_03_weather';
  const result = await runtimeTrigger.processObservation({
    tripId: PILOT_IS_03_TRIP_ID,
    planVersionId: PILOT_IS_03_PLAN_VERSION_ID,
    triggerEventId,
    worldStateSnapshotId: hints.worldStateSnapshotId ?? 'ws_pilot_is_03',
    previousObservation: hints.previousObservation,
    currentObservation: hints.currentObservation,
  });

  const openProblems = await problemStore.list(PILOT_IS_03_TRIP_ID);
  const persisted = openProblems.find(
    (p) => p.triggerEventId === triggerEventId && p.status === 'OPEN',
  );

  const pass =
    result.matched === true &&
    result.transitioned === true &&
    result.problem?.semanticCapability === 'WEATHER_ACTIVITY_PROHIBITED' &&
    Boolean(persisted);

  const output = {
    ok: pass,
    template: 'PILOT-IS-03',
    tripId: PILOT_IS_03_TRIP_ID,
    hookId: result.hook?.hookId,
    problemId: result.problem?.problemId,
    semanticCapability: result.problem?.semanticCapability,
    windSpeedKmh: windAfter,
    transitioned: result.transitioned,
    persistedOpen: Boolean(persisted),
  };

  if (!pass) {
    throw new Error(`PILOT-IS-03 weather runtime smoke failed: ${JSON.stringify(output)}`);
  }
  return output;
}

export async function runPilotIs04SlipRuntimeSmoke(
  prisma: PrismaClient,
): Promise<Record<string, unknown>> {
  const trip = await prisma.trip.findUnique({
    where: { id: PILOT_IS_04_TRIP_ID },
    select: { destination: true, metadata: true, pacingConfig: true },
  });
  if (!trip) {
    throw new Error(
      `Trip ${PILOT_IS_04_TRIP_ID} not found — run: npm run tep:pilot-seed -- --template=04 --reset`,
    );
  }

  const metadata =
    trip.metadata && typeof trip.metadata === 'object' && !Array.isArray(trip.metadata)
      ? (trip.metadata as Record<string, unknown>)
      : {};

  const hints = readPilotRuntimeHints(metadata);
  const slip = hints?.executionSlip;
  if (!slip) {
    throw new Error('pilot_is_04 missing tepPilotRuntimeHints.executionSlip');
  }

  const countryCode = resolveTripDestinationCountry(trip.destination) ?? 'IS';
  const profile = resolveSelfDriveProfile({
    tripId: PILOT_IS_04_TRIP_ID,
    explorationInput: undefined,
    tripPacingConfig: trip.pacingConfig,
    tripMetadata: metadata,
    destinationCountry: countryCode,
  });

  const dailyDrivePlans = await projectDailyDrivePlansForTrip(prisma, PILOT_IS_04_TRIP_ID);
  const dayIndex = dailyDrivePlans[0]?.dayIndex ?? 1;

  const baselineDusk = computeDaylightViolationMinutes({
    countryCode,
    profile,
    dailyDrivePlans,
  });
  const slipArrivals = buildExecutionSlipDaylightArrivals({
    dailyDrivePlans,
    dayIndex,
    slipMinutes: slip.slipMinutes,
    nextActivityId: slip.nextActivityId,
    projectedEta: slip.observedAt,
  });
  const afterSlipDusk = computeDaylightViolationMinutes({
    countryCode,
    profile,
    dailyDrivePlans,
    activityArrivals: slipArrivals,
  });

  if (afterSlipDusk.driveMinutesAfterCivilDusk <= baselineDusk.driveMinutesAfterCivilDusk) {
    throw new Error(
      `Slip did not increase driveMinutesAfterCivilDusk (${baselineDusk.driveMinutesAfterCivilDusk} → ${afterSlipDusk.driveMinutesAfterCivilDusk})`,
    );
  }

  const triggerEventId = slip.triggerEventId ?? 'evt_pilot_is_04_slip';
  const worldStateSnapshotId = slip.worldStateSnapshotId ?? 'ws_pilot_is_04';

  const { pipelineBridge, problemStore } = buildPilotRuntimeStack(prisma);
  const hookResult = await pipelineBridge.tryTriggerFromDaylightScheduleRisk({
    tripId: PILOT_IS_04_TRIP_ID,
    triggerEventId,
    worldStateSnapshotId,
    driveMinutesAfterCivilDusk: afterSlipDusk.driveMinutesAfterCivilDusk,
    activityMinutesAfterSunset: afterSlipDusk.activityMinutesAfterSunset,
    previousDriveMinutesAfterCivilDusk: baselineDusk.driveMinutesAfterCivilDusk,
    previousActivityMinutesAfterSunset: baselineDusk.activityMinutesAfterSunset,
  });

  if (!hookResult?.matched) {
    throw new Error('Daylight hook did not match for pilot_is_04 slip scenario');
  }

  const targetRef = 'activity_stop_405';
  const itemId = resolveItineraryItemIdFromActivityRef(targetRef);
  if (itemId !== PILOT_IS_04_ITEM_STOP) {
    throw new Error(`Unexpected item mapping for ${targetRef}: ${itemId}`);
  }

  const beforeItem = await prisma.itineraryItem.findUnique({ where: { id: itemId } });
  if (!beforeItem) {
    throw new Error(`Item ${itemId} missing before REMOVE writeback`);
  }

  const assessment = validateTepPlanningSnapshot({
    tripId: PILOT_IS_04_TRIP_ID,
    countryCode,
    profile,
    dailyDrivePlans,
  });

  const recoveryGraph =
    readSeededRecoveryGraph(metadata) ??
    projectRecoveryGraph({
      tripId: PILOT_IS_04_TRIP_ID,
      countryCode,
      profile,
      dailyDrivePlans,
      ruleResults: assessment.ruleResults,
    });

  const option =
    recoveryGraph.fallbackOptions.find((o) => o.targetRefs.includes(targetRef)) ??
    buildDaylightRemoveOption(targetRef, dayIndex);

  const { apply, planVersionStore } = buildPilotWritebackStack(prisma);
  const planBefore = await planVersionStore.getEffectivePlanVersionId(PILOT_IS_04_TRIP_ID);
  if (planBefore !== PILOT_IS_04_PLAN_VERSION_ID) {
    throw new Error(`Unexpected effective plan before accept: ${planBefore}`);
  }

  const writeback = await apply.applyRecoveryOption({
    tripId: PILOT_IS_04_TRIP_ID,
    interventionOrOptionId: option.optionId,
    userId: TEP_PILOT_USER_ID,
    basePlanVersionId: PILOT_IS_04_PLAN_VERSION_ID,
  });

  const afterItem = await prisma.itineraryItem.findUnique({ where: { id: itemId } });
  const planAfter = await planVersionStore.getEffectivePlanVersionId(PILOT_IS_04_TRIP_ID);
  const dailyDrivePlansAfter = await projectDailyDrivePlansForTrip(prisma, PILOT_IS_04_TRIP_ID);
  const duskAfterRepair = computeDaylightViolationMinutes({
    countryCode,
    profile,
    dailyDrivePlans: dailyDrivePlansAfter,
    activityArrivals: slipArrivals,
  });

  const openProblem = (await problemStore.list(PILOT_IS_04_TRIP_ID)).find(
    (p) => p.triggerEventId === triggerEventId,
  );

  const pass =
    hookResult.hook?.hookId?.startsWith('HOOK-DAYLIGHT') === true &&
    writeback.appliedAction === 'REMOVE' &&
    writeback.itineraryMaterialized === true &&
    !afterItem &&
    planAfter !== planBefore &&
    duskAfterRepair.driveMinutesAfterCivilDusk === 0;

  const output = {
    ok: pass,
    template: 'PILOT-IS-04',
    tripId: PILOT_IS_04_TRIP_ID,
    hookId: hookResult.hook?.hookId,
    problemId: hookResult.problem?.problemId,
    openProblemStatus: openProblem?.status,
    slipDriveMinutesAfterCivilDusk: afterSlipDusk.driveMinutesAfterCivilDusk,
    duskAfterRepair: duskAfterRepair.driveMinutesAfterCivilDusk,
    optionId: option.optionId,
    planBefore,
    planAfter,
    writeback: {
      appliedAction: writeback.appliedAction,
      removedItemIds: writeback.removedItemIds,
      itineraryMaterialized: writeback.itineraryMaterialized,
    },
  };

  if (!pass) {
    throw new Error(`PILOT-IS-04 slip runtime smoke failed: ${JSON.stringify(output)}`);
  }
  return output;
}

export async function runPilotRuntimeSmoke(
  prisma: PrismaClient,
  template: TepPilotRuntimeSmokeTemplate,
): Promise<Record<string, unknown>> {
  if (template === '02') {
    return runPilotIs02RoadRuntimeSmoke(prisma);
  }
  if (template === '03') {
    return runPilotIs03WeatherRuntimeSmoke(prisma);
  }
  if (template === '04') {
    return runPilotIs04SlipRuntimeSmoke(prisma);
  }

  return {
    ok: true,
    templates: [
      await runPilotIs02RoadRuntimeSmoke(prisma),
      await runPilotIs03WeatherRuntimeSmoke(prisma),
      await runPilotIs04SlipRuntimeSmoke(prisma),
    ],
  };
}

async function main(): Promise<void> {
  const profile = parseEnvProfile(process.argv);
  loadProjectEnv(profile);
  assertSafeDatabase();

  const template = parseRuntimeTemplate(process.argv);
  const prisma = new PrismaClient();
  try {
    await prisma.$connect();
    const result = await runPilotRuntimeSmoke(prisma, template);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
