/**
 * iOS / frontend projection of Iceland Self-Drive Situation.
 * Stable BFF contract — do not leak internal assessor evidence blobs.
 *
 * Schema: tripnara.iceland.self_drive_situation.client@v1
 * Additive optional winter slices + iOS display aliases (fitStatus / coverageTier / …).
 * Omit unknown blocks — never invent hours or plow point ETA.
 */

import type {
  InsuranceCoverageGapAssessment,
  InsuranceCoverageTier,
  RouteExposureCode,
  RouteExposureInput,
} from '../rental-insurance';
import {
  assessInsuranceCoverageGaps,
  formatCoverageGapsSummaryZh,
  recommendInsuranceTier,
} from '../rental-insurance';
import type { IcelandSelfDriveSituationResult } from './iceland-self-drive-situation.types';

export const ICELAND_SELF_DRIVE_SITUATION_CLIENT_SCHEMA =
  'tripnara.iceland.self_drive_situation.client@v1' as const;

export interface IcelandSelfDriveCausalStepClient {
  code: string;
  summaryZh: string;
}

export interface IcelandSelfDriveSituationClientV1 {
  schemaId: typeof ICELAND_SELF_DRIVE_SITUATION_CLIENT_SCHEMA;
  /** @deprecated prefer schemaId; kept for older clients */
  schema?: typeof ICELAND_SELF_DRIVE_SITUATION_CLIENT_SCHEMA;
  tripId?: string;
  generatedAt: string;
  /** Cross-domain product gate */
  gate: IcelandSelfDriveSituationResult['verdict']['gate'];
  /** 人话标题 — 禁止 aggregate= 遥测串 */
  summary: string;
  primaryActions: string[];
  vehicleRoadFit?: {
    /** iOS 主字段 */
    fitStatus: string;
    summaryZh: string;
    vehicleLabel: string;
    roadLabel: string;
    reasons: string[];
    recommendedActions: string[];
    gate: string;
    /** 兼容旧 Decode */
    status?: string;
    vehicleClass?: string;
    roadSegmentId?: string;
    roadBaseType?: string;
    roadStatus?: string;
    conditionsToProceed?: string[];
  };
  weather?: {
    weatherEventId: string;
    effectivePhenomenon?: string;
    /** Inclusive delay range in minutes — never a fake single point */
    delayRangeMin?: [number, number];
    speedLevel?: string;
    routeSafety?: string;
    fatigueDelta?: string;
    visibility?: string;
    /** Ordered: exposure → speed → ETA → booking → load → action */
    causalChain: IcelandSelfDriveCausalStepClient[];
    recommendedActions: string[];
  };
  fuel?: {
    status: string;
    reasons: string[];
    /** Present when station opening projected — UNKNOWN never invents hours */
    openingMode?: string;
  };
  daylight?: {
    nightExposureMinutes: number;
    sameDayDriveMinutes: number;
    winterBufferMinutes: number;
    latestDepartureLocalMin?: number;
    latestArrivalLodgingLocalMin: number;
    suggestedDrivingWindow?: {
      startLocalMin: number;
      endLocalMin: number;
    };
    gate: string;
    reasons: string[];
    recommendedActions: string[];
    stack: {
      fullLoadStack: boolean;
      nightDrivingRequired: boolean;
      exceedsComfortWindow: boolean;
      /** 兼容旧 Decode */
      nightWarn?: boolean;
      heavyDayLoad?: boolean;
      nextMorningBooking?: boolean;
      unfamiliarNightWeather?: boolean;
    };
  };
  /** Attraction winter accessibility — omit when not assessed */
  attractionAccess?: {
    poiId: string;
    status: string;
    enforcement?: string;
    reasons: string[];
    gate: string;
    recommendedActions: string[];
  };
  /** Winter activity cancel / weather-hold risk */
  activityRisk?: {
    experienceCode: string;
    weatherDependency?: string;
    cancelReasonCodes: string[];
    sessionStatus: string;
    gate: string;
    reasons: string[];
    recommendedActions: string[];
  };
  /** Road plow / clearance — delay is always a range when present */
  road?: {
    plowServiceBand?: string;
    plowRuleCode?: string;
    plowDelayRangeMin?: [number, number];
    roadSegmentId?: string;
    gate?: string;
    reasons?: string[];
    recommendedActions?: string[];
  };
  /** Lodging check-in / hours uncertainty */
  lodging?: {
    openingMode: string;
    latestArrivalLocalMin?: number;
    hoursUnknown: boolean;
    gate?: string;
    reasons?: string[];
    recommendedActions?: string[];
  };
  /**
   * Route Exposure → Coverage Gap — omit when no exposure / no gaps.
   * Prefer Situation BFF; do not parse DecisionCase summary for gaps.
   */
  insurance?: {
    /** iOS 主字段 */
    coverageTier: string;
    summaryZh: string;
    routeExposure: {
      flags: string[];
      gravel: boolean;
      highWind: boolean;
      fRoad: boolean;
      fordCrossing: boolean;
      gravelParking?: boolean;
    };
    gaps: Array<{
      code: string;
      exposure: string;
      status: string;
      summaryZh: string;
      /** 兼容旧 Decode */
      dimension?: string;
      triggeredBy?: string[];
      reasonCode?: string;
    }>;
    gate: string;
    recommendedActions: string[];
    fordAlwaysExcluded: true;
    /** 兼容旧 Decode */
    tier?: string;
    recommendedTier?: string;
    hasHardGap?: boolean;
    hasGap?: boolean;
    fordingExcluded?: true;
  };
  /** 人话证据条；总览最多展示前 2 条 */
  aggregateReasons: string[];
  runbookId?: string;
  /** Prefer opening this Decision Space problem when present */
  deepLink?: {
    problemIdHint: string;
    semanticKeyHint: string;
  };
}

const VEHICLE_LABEL_ZH: Record<string, string> = {
  SEDAN: '2WD 轿车',
  SUV_4WD: '四驱 SUV',
  CAMPERVAN: '房车 / Campervan',
  EV_CAMPERVAN: '电动房车',
  HIGH_PROFILE: '高底盘车型',
};

const ROAD_BASE_LABEL_ZH: Record<string, string> = {
  PAVED: '铺装路',
  GRAVEL: '砾石路',
  F_ROAD: 'F 路',
  FORD: '涉水路段',
};

const REASON_ZH: Record<string, string> = {
  VEHICLE_ROAD_CONDITIONAL: '车型与路况匹配需确认',
  VEHICLE_ROAD_INCOMPATIBLE: '当前车型与路况不兼容',
  WEATHER_ROUTE_WARN: '天气将影响通行与到达时间',
  WEATHER_ROUTE_BLOCK: '天气导致路段不可行',
  FUEL_INSUFFICIENT: '燃油补给不足，需调整补给计划',
  FUEL_SPARSE: '补给点稀疏，建议满油出发',
  DAYLIGHT_LOAD_HIGH: '当日驾驶负荷偏高',
  SAME_DAY_DRIVE_LOAD_HIGH: '当日驾驶负荷偏高',
  NIGHT_DRIVING_REQUIRED: '行程包含夜航暴露',
  ATTRACTION_WINTER_PENDING_CONFIRMATION: '冬季景点可达待确认',
  PLOW_REDUCED: '清雪服务降级，行程时间窗将被拉长',
  LODGING_HOURS_UNKNOWN: '住宿营业/入住窗口未知，请确认到达时间',
  INSURANCE_COVERAGE_GAP: '路线暴露与当前保险存在保障缺口',
};

const ACTION_CODE_MAP: Record<string, string> = {
  REPLACE_VEHICLE_OR_ROUTE: 'UPGRADE_VEHICLE',
  SUGGEST_REPLACE_VEHICLE_OR_SEGMENT: 'UPGRADE_VEHICLE',
  CONFIRM_INSURANCE_COVERAGE_GAPS: 'CONFIRM_RENTAL_INSURANCE',
  CONFIRM_INSURANCE_COVERAGE: 'CONFIRM_RENTAL_INSURANCE',
  REPLAN_REQUIRED_DO_NOT_ALLOW: 'REPLAN_ROUTE',
  AVOID_F_ROAD_SEGMENTS: 'AVOID_F_ROAD',
};

function mapFitStatus(status: string): string {
  const u = status.toUpperCase();
  if (u === 'CONDITIONAL' || u === 'MARGINAL') return 'MARGINAL';
  if (u === 'COMPATIBLE' || u === 'OK' || u === 'ALLOW') return 'COMPATIBLE';
  if (u === 'INCOMPATIBLE' || u === 'NO_F_ROAD') return u === 'NO_F_ROAD' ? 'NO_F_ROAD' : 'INCOMPATIBLE';
  return u || 'UNKNOWN';
}

function vehicleLabelZh(
  vehicleClass: string,
  override?: string | null,
): string {
  if (override && override.trim()) return override.trim();
  return VEHICLE_LABEL_ZH[vehicleClass.toUpperCase()] ?? vehicleClass;
}

function roadLabelZh(roadSegmentId: string, roadBaseType: string): string {
  const base = ROAD_BASE_LABEL_ZH[roadBaseType.toUpperCase()] ?? roadBaseType;
  if (!roadSegmentId || roadSegmentId === 'RING_ROAD') {
    return roadSegmentId === 'RING_ROAD' ? `环岛公路 ${base}` : base;
  }
  return `${roadSegmentId} ${base}`;
}

function humanizeReason(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return trimmed;
  if (/[\u4e00-\u9fff]/.test(trimmed)) return trimmed;
  return REASON_ZH[trimmed] ?? REASON_ZH[trimmed.toUpperCase()] ?? trimmed;
}

function mapPrimaryAction(code: string): string {
  const trimmed = code.trim();
  if (!trimmed) return trimmed;
  if (/[\u4e00-\u9fff]/.test(trimmed)) return trimmed;
  return ACTION_CODE_MAP[trimmed] ?? ACTION_CODE_MAP[trimmed.toUpperCase()] ?? trimmed;
}

function isTelemetrySummary(summary: string): boolean {
  return (
    /^aggregate=/i.test(summary) ||
    /runbook=/i.test(summary) ||
    /;[A-Z_]{6,}/.test(summary)
  );
}

function mapClientGapStatus(status: string): string {
  const u = status.toUpperCase();
  if (u === 'NOT_COVERED') return 'GAP';
  if (u === 'UNCONFIRMED') return 'UNKNOWN';
  if (u === 'PARTIAL') return 'PARTIAL';
  if (u === 'EXCLUDED') return 'EXCLUDED';
  if (u === 'COVERED') return 'COVERED';
  return u || 'UNKNOWN';
}

function exposureFlagFromCode(code: RouteExposureCode): string {
  switch (code) {
    case 'GRAVEL_ROAD':
      return 'GRAVEL';
    case 'GRAVEL_PARKING':
      return 'GRAVEL_PARKING';
    case 'WIND_EXPOSED':
      return 'HIGH_WIND';
    case 'UNPAVED_SPUR':
      return 'UNPAVED_SPUR';
    case 'F_ROAD_HIGHLAND':
      return 'F_ROAD';
    case 'FORD_CROSSING':
      return 'FORD_CROSSING';
    default:
      return code;
  }
}

function gapCodeAndSummary(g: {
  dimension: string;
  status: string;
  reasonCode: string;
}): { code: string; summaryZh: string } {
  const dim = g.dimension.toUpperCase();
  if (dim === 'WATER_FORDING' || g.status === 'EXCLUDED') {
    return {
      code: g.reasonCode.includes('FORD') ? g.reasonCode : 'FORD_EXCLUDED',
      summaryZh: '涉水损坏恒不在保障范围',
    };
  }
  if (dim === 'GRAVEL_CHIP') {
    return { code: 'GRAVEL_NOT_COVERED', summaryZh: '碎石路损伤未覆盖' };
  }
  if (dim === 'SAND_ASH') {
    return { code: 'SAND_ASH_GAP', summaryZh: '风沙/火山灰损伤保障不足' };
  }
  if (dim === 'WINDSHIELD') {
    return { code: 'WINDSHIELD_GAP', summaryZh: '挡风玻璃保障不足' };
  }
  if (dim === 'UNDERCARRIAGE') {
    return { code: 'UNDERCARRIAGE_GAP', summaryZh: '底盘损伤保障不足' };
  }
  return {
    code: g.reasonCode || `${dim}_GAP`,
    summaryZh: `${dim} 保障状态：${mapClientGapStatus(g.status)}`,
  };
}

function buildHumanSummary(opts: {
  gate: string;
  vehicleFitStatus?: string;
  insuranceHasGap?: boolean;
  weatherPhenomenon?: string;
  plowBand?: string;
  lodgingHoursUnknown?: boolean;
  daylightGate?: string;
}): string {
  const bits: string[] = [];
  if (
    opts.vehicleFitStatus &&
    opts.vehicleFitStatus !== 'COMPATIBLE' &&
    opts.vehicleFitStatus !== 'OK' &&
    opts.vehicleFitStatus !== 'ALLOW'
  ) {
    bits.push('车型与路况');
  }
  if (opts.insuranceHasGap) bits.push('保险缺口');
  if (opts.weatherPhenomenon) bits.push(opts.weatherPhenomenon);
  if (opts.plowBand && opts.plowBand !== 'DAILY' && opts.plowBand !== 'UNKNOWN') {
    bits.push('清雪');
  }
  if (opts.lodgingHoursUnknown) bits.push('冬季营业');
  if (opts.daylightGate && opts.daylightGate !== 'ALLOW') bits.push('日照负荷');

  if (bits.length === 0) {
    if (opts.gate === 'ALLOW') return '当前自驾方案可继续';
    if (opts.gate === 'BLOCK') return '当前自驾方案存在不可行条件，需要改线或升级车辆';
    if (opts.gate === 'REPLAN_REQUIRED') return '多项条件叠加，建议改线后再确认';
    return '请确认关键自驾条件后再出发';
  }

  if (opts.gate === 'BLOCK') {
    return `${bits.join('、')}导致方案不可行，请改线或升级车辆`;
  }
  if (opts.gate === 'REPLAN_REQUIRED') {
    return `${bits.join('、')}叠加，建议改线后再确认`;
  }
  return `${bits.join('、')}叠加，建议确认车型与到达窗口`;
}

export function projectInsuranceCoverageClient(input: {
  exposure: RouteExposureInput;
  coverageTier?: InsuranceCoverageTier;
}): IcelandSelfDriveSituationClientV1['insurance'] {
  const recommendedTier = recommendInsuranceTier(input.exposure);
  const tier = input.coverageTier ?? recommendedTier;
  const assessment = assessInsuranceCoverageGaps({
    exposure: input.exposure,
    tier,
  });
  if (!assessment.routeExposure.codes.length && !assessment.hasGap) {
    return undefined;
  }
  return projectInsuranceFromAssessment(assessment, recommendedTier);
}

function projectInsuranceFromAssessment(
  assessment: InsuranceCoverageGapAssessment,
  recommendedTier: InsuranceCoverageTier,
): NonNullable<IcelandSelfDriveSituationClientV1['insurance']> {
  const codes = assessment.routeExposure.codes;
  const flags = [...new Set(codes.map(exposureFlagFromCode))];
  const gaps = assessment.gaps.map((g) => {
    const mapped = gapCodeAndSummary(g);
    const exposure =
      g.triggeredBy[0] != null
        ? exposureFlagFromCode(g.triggeredBy[0])
        : flags[0] ?? g.dimension;
    return {
      code: mapped.code,
      exposure,
      status: mapClientGapStatus(g.status),
      summaryZh: mapped.summaryZh,
      dimension: g.dimension,
      triggeredBy: [...g.triggeredBy],
      reasonCode: g.reasonCode,
    };
  });

  const humanSummary =
    gaps.length > 0
      ? '路线暴露与当前保险存在保障缺口'
      : formatCoverageGapsSummaryZh(assessment);

  return {
    coverageTier: assessment.tier,
    summaryZh: humanSummary,
    routeExposure: {
      flags,
      gravel: codes.includes('GRAVEL_ROAD'),
      highWind: codes.includes('WIND_EXPOSED'),
      fRoad: codes.includes('F_ROAD_HIGHLAND'),
      fordCrossing: codes.includes('FORD_CROSSING'),
      gravelParking: codes.includes('GRAVEL_PARKING'),
    },
    gaps,
    gate: assessment.gate,
    recommendedActions: assessment.recommendedActions.map(mapPrimaryAction),
    fordAlwaysExcluded: true,
    tier: assessment.tier,
    recommendedTier,
    hasHardGap: assessment.hasHardGap,
    hasGap: assessment.hasGap,
    fordingExcluded: true,
  };
}

export function projectIcelandSelfDriveSituationClient(
  situation: IcelandSelfDriveSituationResult,
  opts?: {
    tripId?: string;
    generatedAt?: string;
    /** 来自 driving-settings 的展示名 */
    vehicleClassLabel?: string | null;
    /** Structured route exposure for Coverage Gap (optional) */
    insurance?: {
      exposure: RouteExposureInput;
      coverageTier?: InsuranceCoverageTier;
    };
  },
): IcelandSelfDriveSituationClientV1 {
  const tripId = opts?.tripId ?? situation.tripId;
  const wx = situation.weatherImpact;
  const fit = situation.vehicleRoadFit;
  const fuel = situation.fuelAssessment;
  const dl = situation.daylightLoad;
  const winter = situation.winter;
  const insurance = opts?.insurance
    ? projectInsuranceCoverageClient(opts.insurance)
    : undefined;

  const openingModeUnknown = fuel?.reasons.some((r) =>
    r.toUpperCase().includes('UNKNOWN'),
  );

  const fitStatus = fit ? mapFitStatus(fit.status) : undefined;
  const vehicleLabel = fit
    ? vehicleLabelZh(fit.vehicleClass, opts?.vehicleClassLabel)
    : undefined;
  const roadLabel = fit
    ? roadLabelZh(fit.roadSegmentId, fit.roadBaseType)
    : undefined;

  const vehicleRoadFit = fit
    ? {
        fitStatus: fitStatus!,
        summaryZh:
          fitStatus === 'COMPATIBLE'
            ? '当前车型与路况匹配'
            : fitStatus === 'INCOMPATIBLE' || fitStatus === 'NO_F_ROAD'
              ? '当前车型与路况不兼容，需改线或升级车辆'
              : '当前车型对路段余量偏紧',
        vehicleLabel: vehicleLabel!,
        roadLabel: roadLabel!,
        reasons: fit.reasons.map(humanizeReason),
        recommendedActions: [
          ...fit.conditionsToProceed.map(mapPrimaryAction),
          ...(fitStatus === 'MARGINAL' || fitStatus === 'INCOMPATIBLE'
            ? (['UPGRADE_VEHICLE'] as string[])
            : []),
        ].filter((v, i, a) => a.indexOf(v) === i),
        gate: fit.gate,
        status: fit.status,
        vehicleClass: fit.vehicleClass,
        roadSegmentId: fit.roadSegmentId,
        roadBaseType: fit.roadBaseType,
        roadStatus: fit.roadStatus,
        conditionsToProceed: [...fit.conditionsToProceed],
      }
    : undefined;

  const weatherPhenomenonZh =
    wx?.effectivePhenomenon === 'STRONG_WIND' ||
    wx?.effectivePhenomenon === 'GUST'
      ? '强侧风'
      : wx?.effectivePhenomenon;

  const weather = wx
    ? {
        weatherEventId: wx.weatherEventId,
        effectivePhenomenon: weatherPhenomenonZh ?? wx.effectivePhenomenon,
        delayRangeMin: wx.impacts.drivingSpeed?.estimatedDelayRangeMin
          ? ([
              wx.impacts.drivingSpeed.estimatedDelayRangeMin[0],
              wx.impacts.drivingSpeed.estimatedDelayRangeMin[1],
            ] as [number, number])
          : undefined,
        speedLevel: wx.impacts.drivingSpeed?.level,
        routeSafety: wx.impacts.routeSafety?.status,
        fatigueDelta: wx.impacts.fatigue?.delta,
        visibility: wx.impacts.visibility?.status,
        causalChain: (wx.causalChain ?? []).map((s) => ({
          code: s.code,
          summaryZh: s.summaryZh,
        })),
        recommendedActions: wx.recommendedActions.map(mapPrimaryAction),
      }
    : undefined;

  const fuelBlock = fuel
    ? {
        status: fuel.status,
        reasons: fuel.reasons.map(humanizeReason),
        openingMode: openingModeUnknown ? 'UNKNOWN' : undefined,
      }
    : undefined;

  const daylight = dl
    ? {
        nightExposureMinutes: dl.nightExposureMinutes,
        sameDayDriveMinutes: dl.sameDayDriveMinutes,
        winterBufferMinutes: dl.winterBufferMinutes,
        latestDepartureLocalMin: dl.latestDepartureLocalMin,
        latestArrivalLodgingLocalMin: dl.latestArrivalLodgingLocalMin,
        suggestedDrivingWindow: dl.suggestedDrivingWindow,
        gate: dl.gate,
        reasons: dl.reasons.map(humanizeReason),
        recommendedActions: dl.recommendedActions.map(mapPrimaryAction),
        stack: {
          fullLoadStack: dl.stack.fullLoadStack,
          nightDrivingRequired:
            dl.stack.nightWarn || dl.nightExposureMinutes > 0,
          exceedsComfortWindow:
            dl.stack.heavyDayLoad || dl.stack.unfamiliarNightWeather,
          nightWarn: dl.stack.nightWarn,
          heavyDayLoad: dl.stack.heavyDayLoad,
          nextMorningBooking: dl.stack.nextMorningBooking,
          unfamiliarNightWeather: dl.stack.unfamiliarNightWeather,
        },
      }
    : undefined;

  const attractionAccess = winter?.attractionAccess
    ? {
        poiId: winter.attractionAccess.poiId,
        status: winter.attractionAccess.status,
        enforcement: winter.attractionAccess.enforcement,
        reasons: [...winter.attractionAccess.reasons],
        gate: winter.attractionAccess.gate,
        recommendedActions: [
          ...winter.attractionAccess.recommendedActions,
        ].map(mapPrimaryAction),
      }
    : undefined;

  const activityRisk = winter?.activityRisk
    ? {
        experienceCode: winter.activityRisk.experienceCode,
        weatherDependency: winter.activityRisk.weatherDependency,
        cancelReasonCodes: [...winter.activityRisk.cancelReasonCodes],
        sessionStatus: winter.activityRisk.sessionStatus,
        gate: winter.activityRisk.gate,
        reasons: [...winter.activityRisk.reasons],
        recommendedActions: [
          ...winter.activityRisk.recommendedActions,
        ].map(mapPrimaryAction),
      }
    : undefined;

  const road = winter?.snowPlow
    ? {
        plowServiceBand: winter.snowPlow.plowServiceBand,
        plowRuleCode: winter.snowPlow.plowRuleCode,
        plowDelayRangeMin: winter.snowPlow.plowDelayRangeMin
          ? ([
              winter.snowPlow.plowDelayRangeMin[0],
              winter.snowPlow.plowDelayRangeMin[1],
            ] as [number, number])
          : undefined,
        roadSegmentId: winter.snowPlow.roadSegmentId,
        gate: winter.snowPlow.gate,
        reasons: [...winter.snowPlow.reasons],
        recommendedActions: [...winter.snowPlow.recommendedActions].map(
          mapPrimaryAction,
        ),
      }
    : undefined;

  const lodging = winter?.lodging
    ? {
        openingMode: winter.lodging.openingMode,
        latestArrivalLocalMin: winter.lodging.latestArrivalLocalMin,
        hoursUnknown: winter.lodging.hoursUnknown,
        gate: winter.lodging.gate,
        reasons: [...winter.lodging.reasons],
        recommendedActions: [...winter.lodging.recommendedActions].map(
          mapPrimaryAction,
        ),
      }
    : undefined;

  const rawSummary = situation.verdict.summary;
  const summary = isTelemetrySummary(rawSummary)
    ? buildHumanSummary({
        gate: situation.verdict.gate,
        vehicleFitStatus: fitStatus,
        insuranceHasGap: insurance?.hasGap === true,
        weatherPhenomenon: weatherPhenomenonZh,
        plowBand: road?.plowServiceBand,
        lodgingHoursUnknown: lodging?.hoursUnknown === true,
        daylightGate: daylight?.gate,
      })
    : rawSummary;

  const aggregateReasons = [
    ...situation.aggregate.reasons.map(humanizeReason),
    ...(insurance?.hasGap ? ['路线暴露与当前保险存在保障缺口'] : []),
  ].filter((v, i, a) => a.indexOf(v) === i);

  const primaryActions = situation.verdict.primaryActions
    .map(mapPrimaryAction)
    .filter((a) => !a.startsWith('RUNBOOK_') && a !== 'PREPARE_PLAN_VERSION')
    .filter((v, i, a) => a.indexOf(v) === i);

  return {
    schemaId: ICELAND_SELF_DRIVE_SITUATION_CLIENT_SCHEMA,
    schema: ICELAND_SELF_DRIVE_SITUATION_CLIENT_SCHEMA,
    tripId,
    generatedAt: opts?.generatedAt ?? new Date().toISOString(),
    gate: situation.verdict.gate,
    summary,
    primaryActions,
    vehicleRoadFit,
    weather,
    fuel: fuelBlock,
    daylight,
    attractionAccess,
    activityRisk,
    road,
    lodging,
    insurance,
    aggregateReasons,
    runbookId: situation.runbook?.runbookId,
    deepLink: tripId
      ? insurance?.hasGap
        ? {
            problemIdHint: `dc_insurance_${tripId}`,
            semanticKeyHint: 'REQUIRED_CHOICE.RENTAL_INSURANCE',
          }
        : {
            problemIdHint: `dc_vehicle_${tripId}`,
            semanticKeyHint: 'REQUIRED_CHOICE.VEHICLE_ROAD_FIT',
          }
      : undefined,
  };
}
