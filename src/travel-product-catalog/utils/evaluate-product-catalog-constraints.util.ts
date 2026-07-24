/**
 * Product Catalog 约束纯评估（班次窗 / 集合缓冲 / 参与资格 / 天气依赖）
 * Phase-1：供 feasibility / materializer 调用；不依赖 Nest。
 */

export type ProductConstraintSeverity = 'BLOCK' | 'WARN';

export interface ProductCatalogConstraintViolation {
  constraintKey:
    | 'PRODUCT_SESSION_TIME_WINDOW'
    | 'MEETING_POINT_BUFFER'
    | 'PRODUCT_PARTICIPANT_ELIGIBILITY'
    | 'PRODUCT_WEATHER_DEPENDENCY';
  ruleId: string;
  severity: ProductConstraintSeverity;
  message: string;
}

export interface ProductSessionTimingInput {
  meetTimeLocal?: string | null;
  startTimeLocal?: string | null;
  endTimeLocal?: string | null;
  status?: string | null;
  weatherStatus?: string | null;
}

export interface ProductOfferingEligibilityInput {
  minAge?: number | null;
  maxAge?: number | null;
  maxWeightKg?: number | null;
  fitnessRequirement?: string | null;
}

export interface ProductParticipantInput {
  memberId?: string;
  age?: number;
  weightKg?: number;
  fitnessLevel?: string;
}

export interface EvaluateProductCatalogConstraintsInput {
  /** 活动占用窗 HH:mm（通常等于班次 start–end） */
  itemStartLocal?: string | null;
  itemEndLocal?: string | null;
  /** 计划抵达集合点时间；缺省则不在集合规则中复用 itemStart */
  arriveLocal?: string | null;
  session?: ProductSessionTimingInput | null;
  /** 从前一站到集合点的交通分钟数 */
  travelFromPreviousMinutes?: number | null;
  enforceMeetTime?: boolean;
  minBufferMinutes?: number;
  includeParkingMinutes?: number;
  offering?: ProductOfferingEligibilityInput | null;
  participants?: ProductParticipantInput[];
  weatherDependency?: string | null;
  /** 达到该依赖等级起要求 Plan B（默认 HIGH） */
  minWeatherDependency?: string;
  requireFallbackOrHold?: boolean;
  hasFallbackPlan?: boolean;
  enforceMinAge?: boolean;
  enforceFitness?: boolean;
  enforcePhysicalLimits?: boolean;
}

const FITNESS_RANK: Record<string, number> = {
  LOW: 1,
  MODERATE: 2,
  HIGH: 3,
  EXTREME: 4,
};

const WEATHER_DEP_RANK: Record<string, number> = {
  NONE: 0,
  LOW: 1,
  MODERATE: 2,
  HIGH: 3,
  CRITICAL: 4,
};

/** Parse "HH:mm" or "H:mm" → minutes from midnight; null if invalid */
export function localTimeToMinutes(value: string | null | undefined): number | null {
  if (!value || typeof value !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  return hh * 60 + mm;
}

function fitnessMeets(required: string | null | undefined, actual: string | undefined): boolean {
  if (!required) return true;
  if (!actual) return false;
  const need = FITNESS_RANK[required.toUpperCase()] ?? 0;
  const have = FITNESS_RANK[actual.toUpperCase()] ?? 0;
  return have >= need;
}

export function evaluateProductCatalogConstraints(
  input: EvaluateProductCatalogConstraintsInput,
): ProductCatalogConstraintViolation[] {
  const violations: ProductCatalogConstraintViolation[] = [];
  const session = input.session;
  const enforceMeetTime = input.enforceMeetTime !== false;

  if (session) {
    const itemStart = localTimeToMinutes(input.itemStartLocal);
    const itemEnd = localTimeToMinutes(input.itemEndLocal);
    const arrive = localTimeToMinutes(input.arriveLocal);
    const meet = localTimeToMinutes(session.meetTimeLocal);
    const start = localTimeToMinutes(session.startTimeLocal);
    const end = localTimeToMinutes(session.endTimeLocal);

    if (session.status === 'CANCELLED' || session.status === 'WEATHER_HOLD') {
      violations.push({
        constraintKey: 'PRODUCT_SESSION_TIME_WINDOW',
        ruleId: 'product_session_time_window',
        severity: 'BLOCK',
        message: `班次状态为 ${session.status}，不可硬锁进行程`,
      });
    }

    if (enforceMeetTime && meet != null && arrive != null && arrive > meet) {
      violations.push({
        constraintKey: 'PRODUCT_SESSION_TIME_WINDOW',
        ruleId: 'product_session_time_window',
        severity: 'BLOCK',
        message: `须不晚于集合时间 ${session.meetTimeLocal} 到位（当前抵达 ${input.arriveLocal}）`,
      });
    }

    if (start != null && end != null && itemStart != null && itemEnd != null) {
      if (itemStart < start || itemEnd > end) {
        violations.push({
          constraintKey: 'PRODUCT_SESSION_TIME_WINDOW',
          ruleId: 'product_session_time_window',
          severity: 'BLOCK',
          message: `活动须落在班次 ${session.startTimeLocal}–${session.endTimeLocal} 内（当前 ${input.itemStartLocal}–${input.itemEndLocal}）`,
        });
      }
    }

    const minBuffer = Number(input.minBufferMinutes ?? 30);
    if (
      input.travelFromPreviousMinutes != null &&
      Number.isFinite(input.travelFromPreviousMinutes)
    ) {
      const travel = Number(input.travelFromPreviousMinutes);
      const parking = Number(input.includeParkingMinutes ?? 10);
      if (travel < minBuffer) {
        violations.push({
          constraintKey: 'MEETING_POINT_BUFFER',
          ruleId: 'meeting_point_buffer',
          severity: 'BLOCK',
          message: `集合前交通仅 ${travel} 分钟，不足缓冲 ${minBuffer} 分钟（含停车建议 ${parking} 分钟）`,
        });
      }
    }
  }

  const offering = input.offering;
  const participants = input.participants ?? [];
  if (offering && participants.length > 0) {
    for (const p of participants) {
      const label = p.memberId ?? 'participant';
      if (input.enforceMinAge !== false && offering.minAge != null && p.age != null) {
        if (p.age < offering.minAge) {
          violations.push({
            constraintKey: 'PRODUCT_PARTICIPANT_ELIGIBILITY',
            ruleId: 'product_participant_eligibility',
            severity: 'BLOCK',
            message: `${label} 年龄 ${p.age} 低于产品最低 ${offering.minAge} 岁`,
          });
        }
      }
      if (
        input.enforcePhysicalLimits !== false &&
        offering.maxWeightKg != null &&
        p.weightKg != null &&
        p.weightKg > offering.maxWeightKg
      ) {
        violations.push({
          constraintKey: 'PRODUCT_PARTICIPANT_ELIGIBILITY',
          ruleId: 'product_participant_eligibility',
          severity: 'BLOCK',
          message: `${label} 体重超限（上限 ${offering.maxWeightKg} kg）`,
        });
      }
      if (
        input.enforceFitness !== false &&
        offering.fitnessRequirement &&
        !fitnessMeets(offering.fitnessRequirement, p.fitnessLevel)
      ) {
        violations.push({
          constraintKey: 'PRODUCT_PARTICIPANT_ELIGIBILITY',
          ruleId: 'product_participant_eligibility',
          severity: 'BLOCK',
          message: `${label} 体能等级不足（要求 ${offering.fitnessRequirement}）`,
        });
      }
    }
  }

  const depRank = WEATHER_DEP_RANK[(input.weatherDependency ?? '').toUpperCase()] ?? 0;
  const gate =
    WEATHER_DEP_RANK[(input.minWeatherDependency ?? 'HIGH').toUpperCase()] ??
    WEATHER_DEP_RANK.HIGH;
  if (depRank >= gate && input.requireFallbackOrHold !== false) {
    const sessionWeatherHold = session?.status === 'WEATHER_HOLD';
    if (!input.hasFallbackPlan && !sessionWeatherHold) {
      violations.push({
        constraintKey: 'PRODUCT_WEATHER_DEPENDENCY',
        ruleId: 'product_weather_dependency',
        severity: 'WARN',
        message: `天气依赖 ${input.weatherDependency ?? 'HIGH'}：须配置改期/Plan B，或班次进入 WEATHER_HOLD`,
      });
    }
  }

  return violations;
}
