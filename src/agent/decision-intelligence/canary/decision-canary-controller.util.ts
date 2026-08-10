/**
 * Decision Canary Controller — Candidate 按 DecisionKey / Trip Scope / Risk Level 限定放量。
 * 原则：Offline Better ≠ Production Better。
 * DI Validation（Evaluation/Shadow/Benchmark/Promotion）冻结，本模块只做生产 Canary。
 */

export const DECISION_CANARY_CONTROLLER_SCHEMA =
  'nara.decision_canary_controller@v1' as const;

export type CanaryRiskLevel = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export type TripScopeV1 = {
  tripId?: string | null;
  /** 允许的 trip 生命周期 */
  lifecycles?: Array<'PLANNING' | 'TRAVELING' | 'COMPLETED' | 'UNKNOWN'>;
  /** 日范围；空=不限 */
  dayIndexes?: number[];
};

export type DecisionCanaryScopeV1 = {
  decisionKeys: string[];
  tripScope: TripScopeV1;
  maxRiskLevel: CanaryRiskLevel;
  /** 流量比例 0–1 */
  trafficFraction: number;
};

/** 第一批 Real Trip Canary：仅低风险 DecisionKey */
export const FIRST_BATCH_LOW_RISK_DECISION_KEYS = [
  'pace_preference',
  'accommodation_strategy',
  'experience_preference',
  'route_scenic_vs_direct',
] as const;

/** 高安全影响：Production-only */
export const PRODUCTION_ONLY_HIGH_SAFETY_DECISION_KEYS = [
  'vehicle_drive',
  'f_road_access',
  'live_continue_or_abort',
  'weather_exposure',
  'insurance_mandatory',
] as const;

const RISK_RANK: Record<CanaryRiskLevel, number> = {
  LOW: 0,
  MEDIUM: 1,
  HIGH: 2,
  CRITICAL: 3,
};

export type DecisionCanaryAdmission = {
  allowed: boolean;
  reason: string;
  channel: 'PRODUCTION_ONLY' | 'CANARY_ELIGIBLE';
  decisionKey: string;
  riskLevel: CanaryRiskLevel;
};

export type DecisionCanaryControllerV1 = {
  schemaId: typeof DECISION_CANARY_CONTROLLER_SCHEMA;
  version: 1;
  scope: DecisionCanaryScopeV1;
  offlineBetterIsNotProductionBetter: true;
};

export function createDecisionCanaryController(
  scope?: Partial<DecisionCanaryScopeV1>,
): DecisionCanaryControllerV1 {
  return {
    schemaId: DECISION_CANARY_CONTROLLER_SCHEMA,
    version: 1,
    scope: {
      decisionKeys: [
        ...(scope?.decisionKeys ?? [...FIRST_BATCH_LOW_RISK_DECISION_KEYS]),
      ],
      tripScope: scope?.tripScope ?? {
        lifecycles: ['PLANNING', 'TRAVELING'],
      },
      maxRiskLevel: scope?.maxRiskLevel ?? 'LOW',
      trafficFraction: Math.max(
        0,
        Math.min(1, scope?.trafficFraction ?? 0.05),
      ),
    },
    offlineBetterIsNotProductionBetter: true,
  };
}

export function resolveDecisionRiskLevel(decisionKey: string): CanaryRiskLevel {
  if (
    (PRODUCTION_ONLY_HIGH_SAFETY_DECISION_KEYS as readonly string[]).includes(
      decisionKey,
    )
  ) {
    return 'HIGH';
  }
  if (
    (FIRST_BATCH_LOW_RISK_DECISION_KEYS as readonly string[]).includes(decisionKey)
  ) {
    return 'LOW';
  }
  return 'MEDIUM';
}

/**
 * 是否允许进入 Canary 放量（非是否优于 Production）。
 */
export function admitDecisionCanary(input: {
  controller: DecisionCanaryControllerV1;
  decisionKey: string;
  tripId?: string | null;
  lifecycle?: 'PLANNING' | 'TRAVELING' | 'COMPLETED' | 'UNKNOWN';
  dayIndex?: number | null;
  /** 稳定哈希用；缺省则按 decisionKey+tripId */
  trafficBucket?: number;
}): DecisionCanaryAdmission {
  const risk = resolveDecisionRiskLevel(input.decisionKey);
  const scope = input.controller.scope;

  if (
    (PRODUCTION_ONLY_HIGH_SAFETY_DECISION_KEYS as readonly string[]).includes(
      input.decisionKey,
    )
  ) {
    return {
      allowed: false,
      reason: 'high_safety_decision_production_only',
      channel: 'PRODUCTION_ONLY',
      decisionKey: input.decisionKey,
      riskLevel: risk,
    };
  }

  if (!scope.decisionKeys.includes(input.decisionKey)) {
    return {
      allowed: false,
      reason: 'decision_key_not_in_canary_scope',
      channel: 'PRODUCTION_ONLY',
      decisionKey: input.decisionKey,
      riskLevel: risk,
    };
  }

  if (RISK_RANK[risk] > RISK_RANK[scope.maxRiskLevel]) {
    return {
      allowed: false,
      reason: 'risk_level_exceeds_canary_max',
      channel: 'PRODUCTION_ONLY',
      decisionKey: input.decisionKey,
      riskLevel: risk,
    };
  }

  const life = input.lifecycle ?? 'UNKNOWN';
  const allowedLives = scope.tripScope.lifecycles ?? [];
  if (allowedLives.length && !allowedLives.includes(life)) {
    return {
      allowed: false,
      reason: 'trip_lifecycle_out_of_scope',
      channel: 'PRODUCTION_ONLY',
      decisionKey: input.decisionKey,
      riskLevel: risk,
    };
  }

  if (
    scope.tripScope.tripId &&
    input.tripId &&
    scope.tripScope.tripId !== input.tripId
  ) {
    return {
      allowed: false,
      reason: 'trip_id_out_of_scope',
      channel: 'PRODUCTION_ONLY',
      decisionKey: input.decisionKey,
      riskLevel: risk,
    };
  }

  const days = scope.tripScope.dayIndexes ?? [];
  if (
    days.length &&
    input.dayIndex != null &&
    !days.includes(input.dayIndex)
  ) {
    return {
      allowed: false,
      reason: 'day_index_out_of_scope',
      channel: 'PRODUCTION_ONLY',
      decisionKey: input.decisionKey,
      riskLevel: risk,
    };
  }

  const bucket =
    typeof input.trafficBucket === 'number'
      ? Math.abs(input.trafficBucket) % 1000
      : hashBucket(`${input.decisionKey}:${input.tripId ?? ''}`);
  if (bucket / 1000 >= scope.trafficFraction) {
    return {
      allowed: false,
      reason: 'outside_traffic_fraction',
      channel: 'PRODUCTION_ONLY',
      decisionKey: input.decisionKey,
      riskLevel: risk,
    };
  }

  return {
    allowed: true,
    reason: 'canary_admitted',
    channel: 'CANARY_ELIGIBLE',
    decisionKey: input.decisionKey,
    riskLevel: risk,
  };
}

function hashBucket(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % 1000;
}
