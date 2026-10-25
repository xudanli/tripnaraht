#!/usr/bin/env npx tsx
/**
 * 为「冰岛环岛公路」行程写入 showcase 活跃风险：
 * 阵风 ≥18 m/s × 高车身露营车 × 导航 ETA 15:50 × 签到 16:00（缓冲仅 10 分钟）。
 *
 * Usage:
 *   npx tsx scripts/seed-ring-road-gust18-active-risk.ts [tripId]
 */
import { randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { buildIcelandCausalTraceSeed } from '../src/causal-protocol/adapters/iceland-causal-trace.adapter';
import { CAUSAL_SOURCE_REGISTRY } from '../src/causal-protocol/causal-source.registry';
import { CANONICAL_CAUSAL_TRACE_SCHEMA } from '../src/causal-protocol/causal-trace.types';
import type { CanonicalCausalTraceV1 } from '../src/causal-protocol/causal-trace.types';
import { projectCausalStoryView } from '../src/causal-protocol/projectors/causal-story-view.projector';
import { runIcelandSelfDriveCausalAnalysis } from '../src/trips/causal-runtime/domains/iceland-self-drive-causal.engine';
import { defaultLabelForVehicleClass } from '../src/trips/iceland-self-drive/dictionaries/iceland-self-drive-vehicle-catalog';
import { toInputJsonValue } from '../src/trips/budget-os/utils/prisma-json.util';
import { TRAVEL_ETA_CONTRACT_SCHEMA } from '../src/transport/contracts/travel-eta.contract';

const TRIP_ID = process.argv[2] ?? 'bbb5043a-ce2e-4a06-ba6d-39d5bd3f7b10';

/** Day1 south-coast: Skógafoss → Reynisfjara check-in */
const ORIGIN_ITEM_ID = 'b53e6d8c-1235-4adb-8c00-f17b38d15ae0';
const CHECKIN_ITEM_ID = 'e6a7e2e4-6ce5-4531-90c7-652000b8e1ed';
const ROUTE_LABEL = '斯科加瀑布 → 雷尼斯黑沙滩签到';
const WIND_MPS = 18;
const WIND_GUST_MPS = 22;
const APPOINTMENT_SLACK_MIN = 10;
const BASE_DURATION_MIN = 170;
const DISTANCE_KM = 95;

const PROBLEM_ID = `dp_travel:same_day_travel:${ORIGIN_ITEM_ID}:${CHECKIN_ITEM_ID}`;

const prisma = new PrismaClient();

async function main() {
  const trip = await prisma.trip.findUnique({
    where: { id: TRIP_ID },
    select: { id: true, name: true, destination: true, status: true, metadata: true, startDate: true },
  });
  if (!trip) throw new Error(`Trip ${TRIP_ID} not found`);
  if (trip.name !== '冰岛环岛公路') {
    console.warn(`Warning: trip name is "${trip.name}", expected 冰岛环岛公路`);
  }

  const checkInItem = await prisma.itineraryItem.findUnique({
    where: { id: CHECKIN_ITEM_ID },
    select: { id: true, tripDayId: true, startTime: true, note: true },
  });
  if (!checkInItem) throw new Error(`Check-in item ${CHECKIN_ITEM_ID} not found`);

  const focusDate = trip.startDate;
  const checkInAt = new Date(
    Date.UTC(
      focusDate.getUTCFullYear(),
      focusDate.getUTCMonth(),
      focusDate.getUTCDate(),
      16,
      0,
      0,
    ),
  );
  const etaAt = new Date(checkInAt.getTime() - APPOINTMENT_SLACK_MIN * 60_000);
  const departAt = new Date(etaAt.getTime() - BASE_DURATION_MIN * 60_000);

  await prisma.itineraryItem.update({
    where: { id: CHECKIN_ITEM_ID },
    data: {
      startTime: checkInAt,
      note: '下午活动签到（截止 16:00）— 高车身露营车强风演示锚点',
    },
  });

  const meta = (trip.metadata ?? {}) as Record<string, unknown>;
  const isd =
    meta.icelandSelfDrive && typeof meta.icelandSelfDrive === 'object'
      ? ({ ...(meta.icelandSelfDrive as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const drivingSettings =
    isd.drivingSettings && typeof isd.drivingSettings === 'object'
      ? ({ ...(isd.drivingSettings as Record<string, unknown>) } as Record<string, unknown>)
      : {};
  const prevVehicle =
    drivingSettings.vehicle && typeof drivingSettings.vehicle === 'object'
      ? ({ ...(drivingSettings.vehicle as Record<string, unknown>) } as Record<string, unknown>)
      : {};

  drivingSettings.vehicle = {
    ...prevVehicle,
    vehicleClass: 'camper',
    vehicleClassLabel: defaultLabelForVehicleClass('camper') ?? '房车 / Campervan',
    isHighBody: true,
    is4wd: false,
    fuelType: 'diesel',
    source: 'manual',
    recognitionSummary: '高车身露营车 · 阵风≥18 演示场景',
  };
  isd.drivingSettings = drivingSettings;

  const assessment = runIcelandSelfDriveCausalAnalysis({
    routeLabel: ROUTE_LABEL,
    distanceKm: DISTANCE_KM,
    baseDurationMinutes: BASE_DURATION_MIN,
    windMps: WIND_MPS,
    windGustMps: WIND_GUST_MPS,
    windExposure: 'high',
    appointmentSlackMinutes: APPOINTMENT_SLACK_MIN,
    region: 'south_coast',
    // 引擎枚举仅 2WD/4WD；高车身由 highRoof + metadata.vehicleClass=camper 表达
    highRoof: true,
    vehicleClass: '2WD',
  });

  const revision = typeof meta.revision === 'number' ? meta.revision + 1 : 1;
  const worldStateVersion = `ws_${revision}`;
  const nowIso = new Date().toISOString();

  const seed = buildIcelandCausalTraceSeed({
    tripId: TRIP_ID,
    problemId: PROBLEM_ID,
    destination: trip.destination,
    routeLabel: ROUTE_LABEL,
    distanceKm: DISTANCE_KM,
    durationMinutes: BASE_DURATION_MIN,
    windMps: WIND_MPS,
    appointmentSlackMinutes: APPOINTMENT_SLACK_MIN,
    sessionAssessment: assessment,
  });
  if (!seed) throw new Error('Iceland causal seed failed');

  const facts = [...seed.facts];
  const windFact = facts.find((f) => f.factType === 'WEATHER_WIND_GUST');
  if (windFact) {
    windFact.attributes = {
      ...windFact.attributes,
      windMps: WIND_MPS,
      windGustMps: WIND_GUST_MPS,
      highRoof: true,
      vehicleClass: 'camper',
      navEtaLocal: '15:50',
      checkInDeadlineLocal: '16:00',
      appointmentSlackMinutes: APPOINTMENT_SLACK_MIN,
    };
  }

  const block = (meta.canonicalCausalTracesV1 as { traces?: CanonicalCausalTraceV1[] } | undefined) ?? {
    traces: [],
  };
  const staleTraces = (block.traces ?? []).map((tr) => {
    if (!tr.problems.some((p) => p.problemId === PROBLEM_ID)) return tr;
    return { ...tr, status: 'STALE' as const, updatedAt: nowIso };
  });
  const otherTraces = staleTraces.filter(
    (tr) => !tr.problems.some((p) => p.problemId === PROBLEM_ID) || tr.status === 'STALE',
  );

  const trace: CanonicalCausalTraceV1 = {
    schema: CANONICAL_CAUSAL_TRACE_SCHEMA,
    traceId: `ct_${randomBytes(8).toString('hex')}`,
    tripId: TRIP_ID,
    worldStateVersion,
    createdAt: nowIso,
    updatedAt: nowIso,
    trigger: {
      type: 'IN_TRIP_WEATHER_ALERT',
      source: CAUSAL_SOURCE_REGISTRY.ICELAND_SELF_DRIVE_RUNTIME,
      observedAt: nowIso,
    },
    facts,
    effects: seed.effects,
    problems: [seed.problem],
    options: [
      {
        optionId: 'depart_30min_earlier',
        problemId: PROBLEM_ID,
        metricsBefore: { timeMinutes: assessment.travelTime.p90Minutes },
        metricsAfter: {
          timeMinutes: Math.max(
            BASE_DURATION_MIN,
            assessment.travelTime.p90Minutes - 30,
          ),
        },
      },
    ],
    status: 'PREVIEW',
  };

  // 描述内嵌影响时段 + 明确 16:00 签到不可达，供 parseImpactWindow / 建议文案对齐
  const weatherDesc =
    `${ROUTE_LABEL}：南岸阵风 ${WIND_GUST_MPS} m/s（≥18 m/s / 官方红警），高车身露营车侧风不稳；` +
    `影响时段 14:00—18:00；` +
    `导航名义 ETA ${etaAt.toISOString().slice(11, 16)}、签到截止 ${checkInAt.toISOString().slice(11, 16)}（缓冲仅 ${APPOINTMENT_SLACK_MIN} 分钟），` +
    `强风 STOP 下按安全阈值无法按时抵达，16:00 签到窗口已不可达`;

  await prisma.tripEnvironmentEvent.deleteMany({
    where: {
      tripId: TRIP_ID,
      type: 'weather',
      status: 'open',
      OR: [
        { description: { contains: '雷尼斯黑沙滩签到' } },
        { description: { contains: '高车身露营车' } },
        { description: { contains: '阵风 ≥18' } },
        { description: { contains: '阵风 22' } },
      ],
    },
  });

  // 发生时间对齐演示日下午窗口（非「此刻」）
  const detectedAt = new Date(
    Date.UTC(
      focusDate.getUTCFullYear(),
      focusDate.getUTCMonth(),
      focusDate.getUTCDate(),
      14,
      0,
      0,
    ),
  );

  const envEvent = await prisma.tripEnvironmentEvent.create({
    data: {
      tripId: TRIP_ID,
      type: 'weather',
      severity: 'red',
      description: weatherDesc,
      affectedItems: toInputJsonValue([
        {
          itemType: 'activity',
          itemId: ORIGIN_ITEM_ID,
          itemName: '斯科加瀑布',
          originalTime: departAt.toISOString(),
          refundable: true,
        },
        {
          itemType: 'activity',
          itemId: CHECKIN_ITEM_ID,
          itemName: '雷尼斯黑沙滩签到',
          originalTime: checkInAt.toISOString(),
          refundable: false,
        },
      ]),
      alternativePlans: toInputJsonValue([
        {
          planId: 'plan_reschedule_checkin',
          name: '改签 / 推迟雷尼斯黑沙滩 16:00 签到',
          description:
            '强风 STOP + 名义缓冲仅 10 分钟，16:00 签到已不可达；请立即联系场地改期或推迟签到窗口，避免空跑违约',
          timeAdjustment: 'reschedule 16:00 check-in',
          costDifference: 0,
          experienceEquivalence: 0.88,
          bookingRequired: true,
        },
        {
          planId: 'plan_indoor_alt',
          name: '改室内 / 低暴露备选活动',
          description:
            '放弃今日黑沙滩时段，改博物馆、温泉或避风餐饮等低暴露安排，保留下午体验节奏',
          timeAdjustment: 'swap to indoor/low-exposure',
          costDifference: 0,
          experienceEquivalence: 0.72,
          bookingRequired: false,
        },
        {
          planId: 'plan_go_after_wind_drop',
          name: '风力回落后再出发（放弃今日 16:00 窗口）',
          description:
            '待阵风回落至安全阈值后再上路；今日 16:00 签到不再追求，改按新签到时间或次日窗口执行',
          timeAdjustment: 'depart after wind drop; miss 16:00',
          costDifference: 0,
          experienceEquivalence: 0.8,
          bookingRequired: false,
        },
      ]),
      cascadeImpact: toInputJsonValue([
        {
          dimension: 'time',
          level: 'high',
          summary: `16:00 签到窗口不可达（名义缓冲 ${APPOINTMENT_SLACK_MIN} 分钟 + 强风 STOP）`,
        },
        {
          dimension: 'safety',
          level: 'high',
          summary: '高车身露营车在阵风 ≥18 m/s 下不得按原计划上路',
        },
      ]),
      detectedAt,
      status: 'open',
    },
  });

  const travelEtaByToItemId = {
    ...((meta.travelEtaByToItemId as Record<string, unknown> | undefined) ?? {}),
    [CHECKIN_ITEM_ID]: {
      schema: TRAVEL_ETA_CONTRACT_SCHEMA,
      baseDurationMin: BASE_DURATION_MIN,
      planningDurationMin: assessment.travelTime.p90Minutes,
      schedulableDurationMin: BASE_DURATION_MIN,
      uncertaintyMin: Math.max(
        0,
        assessment.travelTime.p90Minutes - BASE_DURATION_MIN,
      ),
      confidence: 0.72,
      adjustmentReasons: ['WEATHER_WIND'],
      authority: 'SHADOW',
      shadowPlanningDurationMin: assessment.travelTime.p90Minutes,
      distanceM: Math.round(DISTANCE_KM * 1000),
      provenance: {
        provider: 'iceland_wind_showcase_seed',
        computedAt: nowIso,
        note: `名义 ETA 15:50 vs 签到 16:00；阵风 ${WIND_GUST_MPS} m/s × 高车身 → 16:00 窗口不可达`,
      },
    },
  };

  await prisma.trip.update({
    where: { id: TRIP_ID },
    data: {
      metadata: toInputJsonValue({
        ...meta,
        icelandSelfDrive: isd,
        travelEtaByToItemId,
        travelEtaSyncedAt: nowIso,
        canonicalCausalTracesV1: {
          traces: [...otherTraces, trace],
          lastUpdatedAt: nowIso,
        },
        revision,
        inTripGust18CamperSeed: {
          problemId: PROBLEM_ID,
          traceId: trace.traceId,
          routeLabel: ROUTE_LABEL,
          windMps: WIND_MPS,
          windGustMps: WIND_GUST_MPS,
          highRoof: true,
          vehicleClass: 'camper',
          navEtaLocal: '15:50',
          checkInDeadlineLocal: '16:00',
          appointmentSlackMinutes: APPOINTMENT_SLACK_MIN,
          environmentEventId: envEvent.id,
          seededAt: nowIso,
        },
      }),
    },
  });

  const guardian = projectCausalStoryView(trace, 'abu');
  const owner = await prisma.tripCollaborator.findFirst({
    where: { tripId: TRIP_ID, role: 'OWNER' },
    select: { userId: true },
  });

  console.log(
    JSON.stringify(
      {
        ok: true,
        tripId: TRIP_ID,
        tripName: trip.name,
        environmentEventId: envEvent.id,
        problemId: PROBLEM_ID,
        traceId: trace.traceId,
        windMps: WIND_MPS,
        windGustMps: WIND_GUST_MPS,
        vehicle: 'camper / highRoof',
        navEta: '15:50',
        checkIn: '16:00',
        p90Minutes: assessment.travelTime.p90Minutes,
        missProbability: assessment.missProbability,
        guardianHeadline: guardian.headline,
        verify: {
          worldState: `GET /api/trips/admin/${TRIP_ID}/world-state`,
          activeRisks: owner
            ? `GET /api/trips/${TRIP_ID}/execution-risks (user ${owner.userId})`
            : `GET /api/trips/${TRIP_ID}/execution-risks`,
          environmentEvents: `GET /api/trips/${TRIP_ID}/in-trip/environment/events`,
        },
      },
      null,
      2,
    ),
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
