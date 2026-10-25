#!/usr/bin/env npx tsx
/**
 * 比赛 Demo 拍摄种子 — 镜头 5～14（World State → Verify）
 *
 * Trip: 「冰岛环岛公路」bbb5043a-ce2e-4a06-ba6d-39d5bd3f7b10
 *
 * Usage:
 *   npx tsx scripts/seed-ring-road-video-demo-shots-5-14.ts [tripId]
 *
 * ─────────────────────────────────────────────────────────────
 * 镜头锚点（可灵/画外音必须对齐的数字与文案，勿改）
 * ─────────────────────────────────────────────────────────────
 * 镜头5 World State（10s）
 *   结论：原计划稳定性下降
 *   六卡：路线 / 天气阵风18m/s+ / 车辆高车身露营车 / 休息 / 同行人 / 行李
 *   高亮：天气、车辆、ETA 15:50、签到 16:00
 *
 * 镜头6 表面正常实际失稳（7s）
 *   ETA 15:50 · 签到 16:00 · 缓冲 10 分钟
 *   叠加：阵风18m/s+、高车身、较高载荷、连续驾驶 2h40m、同行人晕车敏感
 *   终点态：橙色「稳定性下降」（非事故、非立即崩溃）
 *
 * 镜头7 影响链（9s）
 *   主链：强风18m/s+ → 高车身安全车速下降 → ETA延后 → 缓冲压缩 → 错过签到概率↑
 *   辅因：同行人晕车敏感、车辆载荷较高
 *
 * 镜头8 局部决策空间（8s）
 *   保留：当前路线、天气、车辆与油量、休息点、当前活动、今晚酒店、
 *         附近加油站、替代活动、同行人状态
 *
 * 镜头9 四方案（8s）
 *   A 继续赶活动
 *   B 绕开高风暴露路段
 *   C 取消活动并加油休息后去酒店
 *   D 替换附近室内活动后加油并前往酒店  ← 推荐
 *
 * 镜头10 多维比较（9s）
 *   维：安全 / 到达时间 / 体验 / 车辆补给 / 休息需求 / 后续酒店影响 → 推 D
 *
 * 镜头11 Gate（8s）· 12 确认（5s）· 13 执行（8s）· 14 Verify（7s）
 * ─────────────────────────────────────────────────────────────
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

const ORIGIN_ITEM_ID = 'b53e6d8c-1235-4adb-8c00-f17b38d15ae0';
const CHECKIN_ITEM_ID = 'e6a7e2e4-6ce5-4531-90c7-652000b8e1ed';
const ROUTE_LABEL = '斯科加瀑布 → 雷尼斯黑沙滩签到';

/** 可灵字幕锚点：阵风 18m/s+（sustained=18，gust 略高仍标 18+） */
const WIND_MPS = 18;
const WIND_GUST_MPS = 20;
const APPOINTMENT_SLACK_MIN = 10;
/** 连续驾驶 2h40m */
const BASE_DURATION_MIN = 160;
const DISTANCE_KM = 95;
const NAV_ETA_LOCAL = '15:50';
const CHECKIN_LOCAL = '16:00';

const PROBLEM_ID = `dp_travel:same_day_travel:${ORIGIN_ITEM_ID}:${CHECKIN_ITEM_ID}`;

/** 镜头9 四方案 — D 必须排第一（listForRisk 默认首条 isRecommended=true） */
const FILM_PLANS = [
  {
    planId: 'plan_D_indoor_fuel_hotel',
    name: '替换附近室内活动后加油并前往酒店',
    description:
      '推荐：以附近室内/低暴露活动替换黑沙滩时段，完成加油与休息后衔接今晚酒店；安全、时间、体验与后续行程更均衡',
    timeAdjustment: 'indoor alt → fuel → hotel',
    costDifference: 0,
    experienceEquivalence: 0.86,
    bookingRequired: false,
    filmLabel: 'D',
    recommended: true,
    gateHint: 'PASS',
  },
  {
    planId: 'plan_C_cancel_fuel_hotel',
    name: '取消活动并加油休息后去酒店',
    description: '放弃今日黑沙滩签到，就近加油与休息后直达今晚酒店，优先安全与补给',
    timeAdjustment: 'cancel activity → fuel → hotel',
    costDifference: 0,
    experienceEquivalence: 0.62,
    bookingRequired: false,
    filmLabel: 'C',
    recommended: false,
    gateHint: 'PASS',
  },
  {
    planId: 'plan_B_avoid_wind_expose',
    name: '绕开高风暴露路段',
    description: '改走低暴露南岸支线，拉长里程但降低侧风；仍需核对 16:00 签到是否可达',
    timeAdjustment: '+25min via low-exposure',
    costDifference: 0,
    experienceEquivalence: 0.7,
    bookingRequired: false,
    filmLabel: 'B',
    recommended: false,
    gateHint: 'time_window_ORANGE',
  },
  {
    planId: 'plan_A_push_activity',
    name: '继续赶活动',
    description: '维持原路线与 16:00 签到；在阵风 18m/s+ × 高车身下缓冲仅 10 分钟，稳定性继续下降',
    timeAdjustment: 'keep 16:00 check-in',
    costDifference: 0,
    experienceEquivalence: 0.55,
    bookingRequired: false,
    filmLabel: 'A',
    recommended: false,
    gateHint: 'weather_vehicle_BLOCK',
  },
] as const;

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
      note: `下午活动签到（截止 ${CHECKIN_LOCAL}）— 视频 Demo 镜头5-14 锚点`,
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
    recognitionSummary: '高车身露营车 · 视频 Demo 阵风18m/s+',
    /** 较高载荷 / 行李 */
    loadLevel: 'high',
    luggageLoadKg: 180,
    roofLoad: true,
  };

  drivingSettings.members = {
    ...((drivingSettings.members as Record<string, unknown> | undefined) ?? {}),
    hasElderly: false,
    hasChildren: false,
    motionSickness: true,
    companionMotionSensitivity: 'high',
  };

  drivingSettings.routePreference = {
    ...((drivingSettings.routePreference as Record<string, unknown> | undefined) ?? {}),
    restFrequency: 'frequent',
    highWindPreference: 'avoid',
    dailyDrivingLimitHours: 4,
    continuousDriveMinutes: BASE_DURATION_MIN,
  };

  drivingSettings.fuel = {
    ...((drivingSettings.fuel as Record<string, unknown> | undefined) ?? {}),
    fuelType: 'diesel',
    configured: true,
    refuelStrategy: 'early',
    estimatedRangeKm: 220,
    lowFuelRisk: true,
    nearestStationLabel: '附近加油站（南岸）',
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
    highRoof: true,
    vehicleClass: '2WD',
  });

  const revision = typeof meta.revision === 'number' ? meta.revision + 1 : 1;
  const worldStateVersion = `ws_film_${revision}`;
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
      windLabel: '阵风18m/s+',
      highRoof: true,
      vehicleClass: 'camper',
      loadLevel: 'high',
      motionSickness: true,
      continuousDriveMinutes: BASE_DURATION_MIN,
      continuousDriveLabel: '2h40m',
      navEtaLocal: NAV_ETA_LOCAL,
      checkInDeadlineLocal: CHECKIN_LOCAL,
      appointmentSlackMinutes: APPOINTMENT_SLACK_MIN,
      planStability: 'DEGRADED',
      planStabilityLabelZh: '原计划稳定性下降',
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
    traceId: `ct_film_${randomBytes(6).toString('hex')}`,
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
    options: FILM_PLANS.map((p) => ({
      optionId: p.planId,
      problemId: PROBLEM_ID,
      metricsBefore: { timeMinutes: assessment.travelTime.p90Minutes },
      metricsAfter: {
        timeMinutes:
          p.filmLabel === 'D' || p.filmLabel === 'C'
            ? Math.round(assessment.travelTime.pointMinutes * 0.85)
            : assessment.travelTime.p90Minutes,
      },
    })),
    status: 'PREVIEW',
  };

  /** 镜头5–6：黄色/稳定性下降（非直接事故）；Gate 文案仍提示硬约束 */
  const weatherDesc =
    `${ROUTE_LABEL}：原计划稳定性下降。` +
    `南岸阵风 18m/s+（sustained ${WIND_MPS} / gust ${WIND_GUST_MPS}），高车身露营车；` +
    `较高载荷 · 连续驾驶 2h40m · 同行人晕车敏感；` +
    `影响时段 14:00—18:00；` +
    `导航 ETA ${NAV_ETA_LOCAL}、签到截止 ${CHECKIN_LOCAL}（缓冲仅 ${APPOINTMENT_SLACK_MIN} 分钟）。` +
    `单独看导航似乎可行，叠加后原计划已不再稳定。`;

  await prisma.tripEnvironmentEvent.deleteMany({
    where: {
      tripId: TRIP_ID,
      type: 'weather',
      status: 'open',
      OR: [
        { description: { contains: '雷尼斯黑沙滩签到' } },
        { description: { contains: '高车身露营车' } },
        { description: { contains: '阵风' } },
        { description: { contains: '稳定性下降' } },
      ],
    },
  });

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
      /** yellow → UI「稳定性下降」叙事（镜头6）；非 red 事故感 */
      severity: 'yellow',
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
      alternativePlans: toInputJsonValue(
        FILM_PLANS.map(({ filmLabel: _f, recommended: _r, gateHint: _g, ...plan }) => plan),
      ),
      cascadeImpact: toInputJsonValue([
        {
          dimension: 'safety',
          level: 'high',
          summary: '强风18m/s+ → 高车身安全车速下降',
        },
        {
          dimension: 'time',
          level: 'high',
          summary: `ETA 延后 → 相对 ${CHECKIN_LOCAL} 的 ${APPOINTMENT_SLACK_MIN} 分钟缓冲被压缩 → 错过签到概率上升`,
        },
        {
          dimension: 'experience',
          level: 'medium',
          summary: '同行人晕车敏感 · 连续驾驶 2h40m · 较高载荷放大不适',
        },
      ]),
      detectedAt,
      status: 'open',
    },
  });

  // 计算与 ERC 一致的 riskId，写入 film pack，供 App alerts 硬快路径与 recommendations 对齐
  const { attachRiskId, projectEnvironmentEventToRisk } = await import(
    '../src/trips/execution-risk-center/adapters/environment-event-risk.adapter'
  );
  const envDetailForRisk = {
    id: envEvent.id,
    tripId: TRIP_ID,
    type: 'weather' as const,
    severity: 'yellow' as const,
    description: weatherDesc,
    status: 'open' as const,
    detectedAt: detectedAt.toISOString(),
    affectedItemCount: 2,
    alternativePlanCount: FILM_PLANS.length,
    affectedItems: [
      {
        itemType: 'activity' as const,
        itemId: ORIGIN_ITEM_ID,
        itemName: '斯科加瀑布',
        originalTime: departAt.toISOString(),
        refundable: true,
      },
      {
        itemType: 'activity' as const,
        itemId: CHECKIN_ITEM_ID,
        itemName: '雷尼斯黑沙滩签到',
        originalTime: checkInAt.toISOString(),
        refundable: false,
      },
    ],
    alternativePlans: FILM_PLANS.map(({ filmLabel: _f, recommended: _r, gateHint: _g, ...plan }) => plan),
    cascadeImpact: [],
  };
  const filmRiskId = attachRiskId(
    projectEnvironmentEventToRisk(envDetailForRisk, {
      referenceDate: focusDate.toISOString().slice(0, 10),
      evaluatedAt: nowIso,
    }),
  ).id;

  const travelEtaByToItemId = {
    ...((meta.travelEtaByToItemId as Record<string, unknown> | undefined) ?? {}),
    [CHECKIN_ITEM_ID]: {
      schema: TRAVEL_ETA_CONTRACT_SCHEMA,
      baseDurationMin: BASE_DURATION_MIN,
      planningDurationMin: assessment.travelTime.p90Minutes,
      schedulableDurationMin: BASE_DURATION_MIN,
      uncertaintyMin: Math.max(0, assessment.travelTime.p90Minutes - BASE_DURATION_MIN),
      confidence: 0.7,
      adjustmentReasons: ['WEATHER_WIND', 'HIGH_BODY', 'LOAD', 'MOTION_SICKNESS'],
      authority: 'SHADOW',
      shadowPlanningDurationMin: assessment.travelTime.p90Minutes,
      distanceM: Math.round(DISTANCE_KM * 1000),
      provenance: {
        provider: 'iceland_video_demo_shots_5_14',
        computedAt: nowIso,
        note: `名义 ETA ${NAV_ETA_LOCAL} vs 签到 ${CHECKIN_LOCAL}；阵风18m/s+ × 高车身 × 2h40m`,
      },
    },
  };

  /** 镜头5 六维状态卡 + 镜头8 局部决策空间 — 供 Admin world-state / 拍摄对照 */
  const videoDemoFilmPack = {
    schema: 'tripnara.video_demo.shots_5_14@v1',
    seededAt: nowIso,
    environmentEventId: envEvent.id,
    riskId: filmRiskId,
    problemId: PROBLEM_ID,
    traceId: trace.traceId,
    conclusionZh: '原计划稳定性下降',
    conclusionTone: 'orange_degraded',
    anchors: {
      windLabel: '阵风18m/s+',
      windMps: WIND_MPS,
      windGustMps: WIND_GUST_MPS,
      vehicle: '高车身露营车',
      navEtaLocal: NAV_ETA_LOCAL,
      checkInDeadlineLocal: CHECKIN_LOCAL,
      bufferMinutes: APPOINTMENT_SLACK_MIN,
      continuousDriveLabel: '2h40m',
      continuousDriveMinutes: BASE_DURATION_MIN,
      loadLevel: '较高载荷',
      companion: '同行人晕车敏感',
    },
    /** 镜头5 六张状态卡 */
    worldStateCards: [
      {
        id: 'route',
        labelZh: '路线',
        valueZh: ROUTE_LABEL,
        highlight: false,
      },
      {
        id: 'weather',
        labelZh: '天气',
        valueZh: '阵风18m/s+',
        highlight: true,
      },
      {
        id: 'vehicle',
        labelZh: '车辆',
        valueZh: '高车身露营车',
        highlight: true,
      },
      {
        id: 'rest',
        labelZh: '休息',
        valueZh: '连续驾驶 2h40m · 需插入休息点',
        highlight: false,
      },
      {
        id: 'companions',
        labelZh: '同行人',
        valueZh: '晕车敏感',
        highlight: false,
      },
      {
        id: 'luggage',
        labelZh: '行李',
        valueZh: '较高载荷（含车顶）',
        highlight: false,
      },
    ],
    /** 镜头7 因果主链 + 辅因 */
    causalChain: {
      main: [
        '强风18m/s+',
        '高车身车辆安全车速下降',
        'ETA延后',
        '活动缓冲被压缩',
        '错过签到概率上升',
      ],
      auxiliary: ['同行人晕车敏感', '车辆载荷较高'],
    },
    /** 镜头8 局部决策空间保留集 */
    decisionSpaceKeep: [
      '当前路线',
      '天气',
      '车辆与油量',
      '休息点',
      '当前活动',
      '今晚酒店',
      '附近加油站',
      '替代活动',
      '同行人状态',
    ],
    /** 镜头9–10 方案 */
    options: FILM_PLANS.map((p) => ({
      label: p.filmLabel,
      planId: p.planId,
      name: p.name,
      recommended: p.recommended,
      gateHint: p.gateHint,
    })),
    recommendedOption: 'D',
    compareDimensions: ['安全', '到达时间', '体验', '车辆补给', '休息需求', '后续酒店影响'],
    lodgingTonight: '今晚酒店（南岸）',
    nearbyFuel: '附近加油站（南岸）',
    indoorAltLabel: '附近室内/低暴露替代活动',
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
        videoDemoFilmPack,
        inTripGust18CamperSeed: {
          problemId: PROBLEM_ID,
          traceId: trace.traceId,
          routeLabel: ROUTE_LABEL,
          windMps: WIND_MPS,
          windGustMps: WIND_GUST_MPS,
          highRoof: true,
          vehicleClass: 'camper',
          navEtaLocal: NAV_ETA_LOCAL,
          checkInDeadlineLocal: CHECKIN_LOCAL,
          appointmentSlackMinutes: APPOINTMENT_SLACK_MIN,
          continuousDriveMinutes: BASE_DURATION_MIN,
          environmentEventId: envEvent.id,
          filmProfile: 'shots_5_14_stability_degraded',
          seededAt: nowIso,
        },
      }),
    },
  });

  const guardian = projectCausalStoryView(trace, 'abu');
  const recommended = FILM_PLANS.find((p) => p.recommended);

  console.log(
    JSON.stringify(
      {
        ok: true,
        film: 'shots_5_14',
        tripId: TRIP_ID,
        tripName: trip.name,
        environmentEventId: envEvent.id,
        riskId: filmRiskId,
        severity: 'yellow',
        conclusionZh: '原计划稳定性下降',
        anchors: videoDemoFilmPack.anchors,
        recommendedPlan: recommended
          ? { label: recommended.filmLabel, name: recommended.name, planId: recommended.planId }
          : null,
        plans: FILM_PLANS.map((p) => `${p.filmLabel}:${p.name}${p.recommended ? '★' : ''}`),
        p90Minutes: assessment.travelTime.p90Minutes,
        missProbability: assessment.missProbability,
        guardianHeadline: guardian.headline,
        shoot: {
          worldState: `GET /api/trips/admin/${TRIP_ID}/world-state`,
          alerts: `GET /api/mobile/trips/${TRIP_ID}/execution/execution-alerts`,
          recommendations: 'GET /api/trips/{tripId}/execution-risks/{riskId}/recommendations',
          metadataKey: 'trip.metadata.videoDemoFilmPack',
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
