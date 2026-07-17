/**
 * Insurance decision trip-context pack — deterministic facts for Copilot / Narrative.
 * Completeness is tracked per field; RAG must never fill these as SSOT.
 */

export type ContextFieldStatus = 'CONFIRMED' | 'MISSING' | 'UNKNOWN';

export interface ContextField<T = unknown> {
  status: ContextFieldStatus;
  value?: T;
  /** Short fact line for advisor prompt (only when CONFIRMED). */
  factLine?: string;
}

export interface InsuranceDecisionContext {
  schema: 'tripnara.insurance_decision_context@v1';
  tripId: string;
  /** Hard gate: route + vehicle must be present before LLM recommend. */
  gate: {
    ok: boolean;
    code?: 'CONTEXT_MISSING';
    missing: Array<'ROUTE_SUMMARY' | 'VEHICLE_BOOKING'>;
  };
  fields: {
    selfDriveSeason: ContextField<{ startDate?: string; endDate?: string; seasonHint?: string }>;
    routeSummary: ContextField<{ dayCount: number; routeReady: boolean }>;
    roadExposure: ContextField<{
      hasGravel: boolean;
      hasFRoad: boolean;
      hasMountainHint: boolean;
    }>;
    driveLoad: ContextField<{
      totalDriveKm?: number;
      maxDayDriveHours?: number;
      avgDailyDriveHours?: number;
    }>;
    weatherRisk: ContextField<{ highWind: boolean; volcanicAshHint?: boolean }>;
    vehicleBooking: ContextField<{
      vehicleType?: string;
      rentalCompany?: string;
    }>;
    memberDriverProfile: ContextField<{
      driverCount?: number;
      experienceHint?: string;
    }>;
    teamRiskTolerance: ContextField<{ level?: string }>;
    budget: ContextField<{ currency?: string; total?: number; style?: string }>;
    existingInsurance: ContextField<{
      creditCardCover?: boolean;
      travelInsurance?: boolean;
      notes?: string;
    }>;
  };
  /** Confirmed fact lines only — for advisor prompt. */
  confirmedFacts: string[];
  /** Field keys still MISSING (not UNKNOWN). */
  missingFields: string[];
}

export function isRentalInsuranceProblem(input: {
  problemId?: string;
  semanticKey?: string | null;
  domain?: string | null;
}): boolean {
  const id = input.problemId ?? '';
  const sk = input.semanticKey ?? '';
  const domain = input.domain ?? '';
  return (
    domain === 'INSURANCE' ||
    sk.includes('RENTAL_INSURANCE') ||
    sk.includes('INSURANCE') ||
    id.startsWith('dc_insurance')
  );
}

export function buildInsuranceContextMissingSelection(input: {
  focusedProblemId: string;
  missing: Array<'ROUTE_SUMMARY' | 'VEHICLE_BOOKING'>;
}): {
  mode: 'ATTENTION';
  priority: 'P1';
  insightType: 'DATA_UNCERTAINTY';
  title: string;
  observationSummary: string;
  explanationSummary: string;
  impacts: [];
  recommendation: { summary: string; rationale: string };
  actions: Array<{
    kind: 'NAVIGATION';
    label: string;
    target: { pageId: 'ITINERARY_EDITOR' | 'DECISION_SPACE' };
  }>;
  confidence: number;
  evidenceRefs: string[];
  factRefs: string[];
  focusedProblemId: string;
  modeReason: 'CONTEXT_MISSING';
} {
  const needVehicle = input.missing.includes('VEHICLE_BOOKING');
  const needRoute = input.missing.includes('ROUTE_SUMMARY');
  const explanation =
    needVehicle && needRoute
      ? '缺少车辆和道路信息，暂时无法判断保险需求。'
      : needVehicle
        ? '缺少车辆信息，暂时无法判断保险需求。'
        : '缺少路线信息，暂时无法判断保险需求。';
  const advice =
    needVehicle && needRoute
      ? '先完善租车与路线信息'
      : needVehicle
        ? '先确认车型与租车信息'
        : '先完善行程路线信息';

  return {
    mode: 'ATTENTION',
    priority: 'P1',
    insightType: 'DATA_UNCERTAINTY',
    title: '还无法判断保险方案',
    observationSummary: explanation,
    explanationSummary: explanation,
    impacts: [],
    recommendation: {
      summary: advice,
      rationale: '服务端 Context Builder 门禁：ROUTE_SUMMARY 与 VEHICLE_BOOKING 为保险推荐前置条件。',
    },
    actions: [
      {
        kind: 'NAVIGATION',
        label: needRoute ? '完善路线' : '查看决策空间',
        target: { pageId: needRoute ? 'ITINERARY_EDITOR' : 'DECISION_SPACE' },
      },
    ],
    confidence: 1,
    evidenceRefs: [],
    factRefs: [`decision-problem:${input.focusedProblemId}`, 'context-gate:CONTEXT_MISSING'],
    focusedProblemId: input.focusedProblemId,
    modeReason: 'CONTEXT_MISSING',
  };
}

/**
 * Responsible insurance advisor — never recommend BASIC solely because fording
 * is excluded (all tiers exclude fording; that is a travel constraint, not a tier picker).
 */
export function buildInsuranceAdvisorFromContext(ctx: InsuranceDecisionContext): {
  title: string;
  body: string;
  advice: string;
  recommendedTier: 'BASIC' | 'STANDARD_GP' | 'FULL' | 'COMPARE';
} {
  const gravel = ctx.fields.roadExposure.value?.hasGravel === true;
  const froad = ctx.fields.roadExposure.value?.hasFRoad === true;
  const mountain = ctx.fields.roadExposure.value?.hasMountainHint === true;
  const highWind = ctx.fields.weatherRisk.value?.highWind === true;
  const ash = ctx.fields.weatherRisk.value?.volcanicAshHint === true;
  const hasExisting =
    ctx.fields.existingInsurance.value?.creditCardCover === true ||
    ctx.fields.existingInsurance.value?.travelInsurance === true;

  if (gravel || ash) {
    return {
      title: '碎石暴露需加保',
      body: '本次路线碎石或灰损暴露偏高，基础 CDW 覆盖不足。',
      advice: '优先选含碎石 GP 的方案',
      recommendedTier: 'STANDARD_GP',
    };
  }

  if (froad || mountain) {
    return {
      title: '高地路段提高保障',
      body: '路线含 F-road / 高地，底盘与路况风险更高。',
      advice: '提高保障档并避开涉水',
      recommendedTier: 'FULL',
    };
  }

  if (highWind) {
    return {
      title: '高风段注意门损',
      body: '途经高风暴露区域，开门损与侧风风险更高。',
      advice: '核对风损条款或提高档位',
      recommendedTier: 'STANDARD_GP',
    };
  }

  if (hasExisting) {
    return {
      title: '已有部分保障',
      body: '已有信用卡或旅行险部分覆盖，仍需核对碎石与底盘缺口。',
      advice: '对照已有保障补齐缺口',
      recommendedTier: 'COMPARE',
    };
  }

  // Route ready but no specific exposure: do NOT push BASIC via fording disclaimer
  return {
    title: '按路况比较档位',
    body: '涉水各档均不保，请按碎石与底盘风险选档，勿因涉水选基础险。',
    advice: '比较标准 GP 与全险差异',
    recommendedTier: 'COMPARE',
  };
}

/** Detect irresponsible “ford → buy basic CDW” advice (LLM or stale copy). */
export function isIrresponsibleInsuranceAdvice(text: string): boolean {
  const t = text.replace(/\s/g, '');
  const mentionsFord = /涉水|过河|fording|河滩/.test(t);
  const pushesBasic = /基础CDW|基础险|选基础|选择基础/.test(t);
  return mentionsFord && pushesBasic;
}

