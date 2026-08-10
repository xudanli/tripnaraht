/**
 * Project weather facts → driving impact (ranges, not fake exact ETA minutes).
 * Builds an ordered causal chain: exposure → speed → ETA → booking → load → action.
 */

import { TEMPORAL_IMPACT_SCHEMA } from '../../../../travel-causal-decision/types/temporal-impact.types';
import type { SourceReference } from '../iceland-knowledge.types';
import {
  loadIcelandWeatherDrivingPolicy,
  type WeatherDrivingPolicyFile,
} from './iceland-road-weather.loader';
import type {
  DrivingWeatherCausalStep,
  DrivingWeatherImpact,
  DrivingWeatherImpactInput,
  DrivingWeatherPhenomenon,
  FatigueDelta,
  RouteSafetyStatus,
} from './iceland-road-weather.types';

const POLICY_EVIDENCE: SourceReference = {
  kind: 'PACK_FILE',
  path: 'knowledge/weather-driving-impact/is-weather-driving-policy.json',
  version: '1.1.0',
};

const PHENOMENON_ZH: Record<DrivingWeatherPhenomenon, string> = {
  STRONG_WIND: '强风',
  GUST: '强阵风/侧风',
  SNOW: '降雪',
  ICE: '路面结冰',
  FREEZING_RAIN: '冻雨',
  LOW_VISIBILITY: '能见度下降',
  HEAVY_RAIN: '暴雨与积水',
  DUST_ASH: '沙尘或火山灰',
  EXTREME_COLD: '极寒',
  MULTI: '多天气组合',
};

function bumpFatigue(delta: FatigueDelta, night: boolean): FatigueDelta {
  if (!night) return delta;
  if (delta === 'LOW') return 'MEDIUM';
  if (delta === 'MEDIUM') return 'HIGH';
  return 'HIGH';
}

function scaleRange(
  base: [number, number],
  multiplier: number,
  boost: [number, number],
): [number, number] {
  const lo = Math.round(base[0] * multiplier + boost[0]);
  const hi = Math.round(base[1] * multiplier + boost[1]);
  return [lo, Math.max(lo, hi)];
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function escalateRouteSafety(
  a: RouteSafetyStatus,
  b: RouteSafetyStatus,
): RouteSafetyStatus {
  const rank: Record<RouteSafetyStatus, number> = { PASS: 0, WARN: 1, BLOCK: 2 };
  return rank[a] >= rank[b] ? a : b;
}

function resolvePhenomenonKey(
  input: DrivingWeatherImpactInput,
  policy: WeatherDrivingPolicyFile,
): DrivingWeatherPhenomenon {
  let phenomenonKey: DrivingWeatherPhenomenon = input.phenomenon;

  if (
    (input.phenomenon === 'STRONG_WIND' || input.phenomenon === 'GUST') &&
    typeof input.windGustMs === 'number'
  ) {
    const gustCfg = policy.phenomena.GUST;
    const strongCfg = policy.phenomena.STRONG_WIND;
    if (
      gustCfg?.gustThresholdMs != null &&
      input.windGustMs >= gustCfg.gustThresholdMs
    ) {
      phenomenonKey = 'GUST';
    } else if (
      strongCfg?.gustThresholdMs != null &&
      input.windGustMs >= strongCfg.gustThresholdMs
    ) {
      phenomenonKey = 'STRONG_WIND';
    }
  }

  const extras = (input.additionalPhenomena ?? []).filter(
    (p) => p !== phenomenonKey,
  );
  if (extras.length > 0 || input.phenomenon === 'MULTI') {
    return 'MULTI';
  }
  return phenomenonKey;
}

function mergeDelayWithSecondaries(
  primary: [number, number],
  secondaries: DrivingWeatherPhenomenon[],
  policy: WeatherDrivingPolicyFile,
): [number, number] {
  let lo = primary[0];
  let hi = primary[1];
  for (const p of secondaries) {
    const cfg = policy.phenomena[p];
    if (!cfg?.delayRangeMin) continue;
    lo = Math.max(lo, cfg.delayRangeMin[0]);
    hi = Math.max(hi, cfg.delayRangeMin[1]);
  }
  return [lo, Math.max(lo, hi)];
}

function buildCausalChain(input: {
  phenomenon: DrivingWeatherPhenomenon;
  segments: string[];
  delayRange: [number, number];
  fatigueDelta: FatigueDelta;
  routeSafety: RouteSafetyStatus;
  bookingMissHintDelayMin: number;
  highProfile: boolean;
  exposure: string;
}): DrivingWeatherCausalStep[] {
  const label = PHENOMENON_ZH[input.phenomenon] ?? input.phenomenon;
  const seg =
    input.segments.length > 0 ? input.segments.slice(0, 2).join('/') : '当前路段';
  const chain: DrivingWeatherCausalStep[] = [
    {
      code: `SEGMENT_EXPOSED_${input.phenomenon}`,
      summaryZh: `${seg}预计受到${label}影响（暴露=${input.exposure}）`,
    },
    {
      code: 'EXPECT_LOWER_AVERAGE_SPEED',
      summaryZh: '平均行驶速度可能下降',
    },
    {
      code: `ETA_DELAY_${input.delayRange[0]}_${input.delayRange[1]}_MIN`,
      summaryZh: `ETA 可能增加约 ${input.delayRange[0]}–${input.delayRange[1]} 分钟（区间，非精确点）`,
    },
  ];

  if (input.delayRange[1] >= input.bookingMissHintDelayMin) {
    chain.push({
      code: 'MAY_MISS_ACTIVITY_OR_BOOKING_WINDOW',
      summaryZh: '可能错过活动集合或预订时间窗',
    });
  }

  if (input.fatigueDelta === 'HIGH' || input.highProfile) {
    chain.push({
      code: 'CONTINUOUS_DRIVE_LOAD_UP',
      summaryZh: '连续驾驶负荷上升（高车身/恶劣天气更明显）',
    });
  }

  if (input.routeSafety === 'BLOCK') {
    chain.push({
      code: 'REROUTE_OR_END_DAY_EARLY',
      summaryZh: '建议改线或提前结束当天行程',
    });
  } else if (input.fatigueDelta === 'HIGH') {
    chain.push({
      code: 'SHORTEN_PREVIOUS_STOP_OR_STOP_EARLY',
      summaryZh: '建议缩短上一景点停留或提前寻找安全停车',
    });
  } else {
    chain.push({
      code: 'CONFIRM_EXPOSURE_ACCEPTANCE',
      summaryZh: '请确认是否接受当前暴露风险后继续',
    });
  }

  return chain;
}

export function assessDrivingWeatherImpact(
  input: DrivingWeatherImpactInput,
  policy: WeatherDrivingPolicyFile = loadIcelandWeatherDrivingPolicy(),
): DrivingWeatherImpact {
  // Visibility above threshold → mild monitoring only
  if (
    input.phenomenon === 'LOW_VISIBILITY' &&
    typeof input.visibilityM === 'number' &&
    policy.phenomena.LOW_VISIBILITY?.visibilityThresholdM != null &&
    input.visibilityM > policy.phenomena.LOW_VISIBILITY.visibilityThresholdM &&
    !(input.additionalPhenomena?.length)
  ) {
    return {
      weatherEventId: input.weatherEventId,
      affectedRoadSegments: input.affectedRoadSegments,
      effectivePhenomenon: 'LOW_VISIBILITY',
      vehicleModifiers: [
        {
          vehicleClass: input.vehicleClass,
          riskMultiplier: policy.vehicleRiskMultipliers[input.vehicleClass] ?? 1,
        },
      ],
      impacts: {
        drivingSpeed: { level: 'NONE' },
        fatigue: { delta: 'LOW' },
        visibility: { status: 'NORMAL' },
        routeSafety: { status: 'PASS' },
      },
      causalChain: [
        {
          code: 'VISIBILITY_ABOVE_THRESHOLD',
          summaryZh: '能见度优于政策阈值，继续监测即可',
        },
        {
          code: 'CONTINUE_WITH_MONITORING',
          summaryZh: '建议保持关注，无需强制改线',
        },
      ],
      temporalImpact: {
        schema: TEMPORAL_IMPACT_SCHEMA,
        detectedAt: input.detectedAt ?? new Date().toISOString(),
        confidence: 0.6,
        assumptions: ['visibility_above_policy_threshold'],
      },
      recommendedActions: ['CONTINUE_WITH_MONITORING'],
      evidence: [POLICY_EVIDENCE],
      confidence: 0.6,
    };
  }

  const secondaries = (input.additionalPhenomena ?? []).filter(
    (p) => p !== input.phenomenon,
  );
  const phenomenonKey = resolvePhenomenonKey(input, policy);
  const cfg = policy.phenomena[phenomenonKey] ?? policy.phenomena.MULTI!;

  const riskMult = policy.vehicleRiskMultipliers[input.vehicleClass] ?? 1;
  const expMult =
    policy.experienceDelayMultipliers?.[input.driverExperience ?? 'EXPERIENCED'] ??
    1;
  const exposure = input.roadExposure ?? 'MEDIUM';
  const boost = policy.exposureDelayBoost[exposure] ?? [0, 0];

  const segCfg = policy.segmentLength ?? {
    referenceKm: 80,
    minScale: 0.75,
    maxScale: 1.55,
  };
  const segScale =
    typeof input.segmentLengthKm === 'number' &&
    Number.isFinite(input.segmentLengthKm) &&
    input.segmentLengthKm > 0
      ? clamp(
          input.segmentLengthKm / segCfg.referenceKm,
          segCfg.minScale,
          segCfg.maxScale,
        )
      : 1;

  let baseDelay = cfg.delayRangeMin as [number, number];
  if (phenomenonKey === 'MULTI' && secondaries.length > 0) {
    const primaryCfg =
      policy.phenomena[input.phenomenon] ?? policy.phenomena.MULTI!;
    baseDelay = mergeDelayWithSecondaries(
      primaryCfg.delayRangeMin as [number, number],
      secondaries,
      policy,
    );
    // Floor against MULTI template
    const multi = policy.phenomena.MULTI!.delayRangeMin;
    baseDelay = [
      Math.max(baseDelay[0], multi[0]),
      Math.max(baseDelay[1], multi[1]),
    ];
  }

  const delayRange = scaleRange(
    baseDelay,
    riskMult * expMult * segScale,
    boost,
  );

  const highProfile =
    input.vehicleClass === 'CAMPERVAN' ||
    input.vehicleClass === 'EV_CAMPERVAN' ||
    input.vehicleClass === 'HIGH_PROFILE';

  let routeSafety = cfg.routeSafety as RouteSafetyStatus;
  if (
    highProfile &&
    (phenomenonKey === 'GUST' || phenomenonKey === 'STRONG_WIND') &&
    exposure === 'HIGH'
  ) {
    routeSafety =
      riskMult >= 1.35 && phenomenonKey === 'GUST' ? 'BLOCK' : 'WARN';
  }
  if (phenomenonKey === 'MULTI') {
    for (const p of [input.phenomenon, ...secondaries]) {
      const s = policy.phenomena[p]?.routeSafety as RouteSafetyStatus | undefined;
      if (s) routeSafety = escalateRouteSafety(routeSafety, s);
    }
    routeSafety = escalateRouteSafety(routeSafety, 'BLOCK');
  }

  const fatigueDelta = policy.nightFatigueBump
    ? bumpFatigue(cfg.fatigueDelta, !!input.isNight)
    : cfg.fatigueDelta;

  const bookingMissHint =
    policy.bookingMissHintDelayMin ?? 30;

  const causalChain = buildCausalChain({
    phenomenon: phenomenonKey,
    segments: input.affectedRoadSegments,
    delayRange,
    fatigueDelta,
    routeSafety,
    bookingMissHintDelayMin: bookingMissHint,
    highProfile,
    exposure,
  });

  const recommendedActions: string[] = causalChain.map((s) => s.code);
  // Keep legacy action aliases for downstream runbooks/certs
  if (!recommendedActions.includes('EXPECT_LOWER_AVERAGE_SPEED') && cfg.speedLevel !== 'NONE') {
    recommendedActions.unshift('EXPECT_LOWER_AVERAGE_SPEED');
  }
  if (cfg.speedLevel !== 'NONE') {
    recommendedActions.push(
      `ETA_MAY_INCREASE_${delayRange[0]}_${delayRange[1]}_MIN`,
    );
  }

  const assumptions = [
    `phenomenon=${phenomenonKey}`,
    `vehicle=${input.vehicleClass}`,
    `exposure=${exposure}`,
    `experience=${input.driverExperience ?? 'EXPERIENCED'}`,
    `delay_is_range_not_point`,
    `segScale=${segScale.toFixed(2)}`,
  ];
  if (secondaries.length) {
    assumptions.push(`additional=${secondaries.join('+')}`);
  }
  if (input.segmentLengthKm != null) {
    assumptions.push(`segmentKm=${input.segmentLengthKm}`);
  }
  if (input.isNight) assumptions.push('night_driving=true');

  return {
    weatherEventId: input.weatherEventId,
    affectedRoadSegments: input.affectedRoadSegments,
    effectivePhenomenon: phenomenonKey,
    vehicleModifiers: [
      { vehicleClass: input.vehicleClass, riskMultiplier: riskMult },
    ],
    impacts: {
      drivingSpeed: {
        level: cfg.speedLevel,
        estimatedDelayRangeMin: delayRange,
      },
      fatigue: { delta: fatigueDelta },
      visibility: {
        status: cfg.visibility ?? 'NORMAL',
      },
      routeSafety: { status: routeSafety },
    },
    causalChain,
    temporalImpact: {
      schema: TEMPORAL_IMPACT_SCHEMA,
      detectedAt: input.detectedAt ?? new Date().toISOString(),
      confidence: 0.72,
      assumptions,
    },
    recommendedActions: [...new Set(recommendedActions)],
    evidence: [
      POLICY_EVIDENCE,
      {
        kind: 'REPO_FILE',
        path: 'src/trips/guardian-decision-core/attention/wind-causal-chain.rules.ts',
      },
    ],
    confidence: 0.72,
  };
}
