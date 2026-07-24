/**
 * Vehicle (车型) decision trip-context pack — Contextual Copilot primary example.
 * Explains *why* a class fits the route; RAG must not replace route facts.
 */

export type VehicleContextFieldStatus = 'CONFIRMED' | 'MISSING' | 'UNKNOWN';

export interface VehicleContextField<T = unknown> {
  status: VehicleContextFieldStatus;
  value?: T;
  factLine?: string;
}

export interface VehicleDecisionContext {
  schema: 'tripnara.vehicle_decision_context@v1';
  tripId: string;
  gate: {
    ok: boolean;
    code?: 'CONTEXT_MISSING';
    missing: Array<'ROUTE_SUMMARY' | 'ROAD_EXPOSURE'>;
  };
  routeFacts: {
    containsFRoad: boolean;
    highlandRoute: boolean;
    roadTypes: string[];
    gravelShareHint?: string;
  };
  teamFacts: {
    passengerCount?: number;
    luggageLevel?: 'LIGHT' | 'NORMAL' | 'HEAVY';
    hasChildrenOrElderly?: boolean;
  };
  recommendation: {
    vehicleType: string;
    optionId?: string;
    reasons: string[];
  };
  invalidatedWhen: string[];
  fields: {
    routeSummary: VehicleContextField<{ dayCount: number; routeReady: boolean }>;
    roadExposure: VehicleContextField<{
      containsFRoad: boolean;
      highlandRoute: boolean;
      hasGravel: boolean;
    }>;
    season: VehicleContextField<{ seasonHint?: string }>;
    roadOpenStatus: VehicleContextField<{ statusHint?: string }>;
    teamCapacity: VehicleContextField<{
      passengerCount?: number;
      luggageLevel?: string;
      hasChildrenOrElderly?: boolean;
    }>;
    budget: VehicleContextField<{ style?: string; total?: number }>;
    driverExperience: VehicleContextField<{ hint?: string }>;
    vehicleAvailability: VehicleContextField<{ note?: string }>;
  };
  confirmedFacts: string[];
  missingFields: string[];
  /** Structured input for advisor LLM (matches product example). */
  advisorInput: {
    routeFacts: VehicleDecisionContext['routeFacts'];
    teamFacts: VehicleDecisionContext['teamFacts'];
    recommendation: VehicleDecisionContext['recommendation'];
    invalidatedWhen: string[];
  };
}

export function isVehicleRoadFitProblem(input: {
  problemId?: string;
  semanticKey?: string | null;
  domain?: string | null;
}): boolean {
  const id = input.problemId ?? '';
  const sk = input.semanticKey ?? '';
  return (
    sk.includes('VEHICLE_ROAD_FIT') ||
    sk.includes('VEHICLE') ||
    id.startsWith('dc_vehicle')
  );
}

export function buildVehicleContextMissingSelection(input: {
  focusedProblemId: string;
  missing: Array<'ROUTE_SUMMARY' | 'ROAD_EXPOSURE'>;
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
  return {
    mode: 'ATTENTION',
    priority: 'P1',
    insightType: 'DATA_UNCERTAINTY',
    title: '还无法判断车型',
    observationSummary: '缺少路线道路信息，暂时无法判断车型需求。',
    explanationSummary: '缺少路线道路信息，暂时无法判断车型需求。',
    impacts: [],
    recommendation: {
      summary: '先完善行程路线信息',
      rationale: '服务端 Context Builder 门禁：ROUTE_SUMMARY 为车型推荐前置条件。',
    },
    actions: [
      {
        kind: 'NAVIGATION',
        label: '完善路线',
        target: { pageId: 'ITINERARY_EDITOR' },
      },
    ],
    confidence: 1,
    evidenceRefs: [],
    factRefs: [`decision-problem:${input.focusedProblemId}`, 'context-gate:CONTEXT_MISSING'],
    focusedProblemId: input.focusedProblemId,
    modeReason: 'CONTEXT_MISSING',
  };
}

/** Deterministic advisor copy when route facts are present. */
export function buildVehicleAdvisorFromContext(ctx: VehicleDecisionContext): {
  title: string;
  body: string;
  advice: string;
} {
  const rec = ctx.recommendation.vehicleType;
  if (!ctx.routeFacts.containsFRoad && !ctx.routeFacts.highlandRoute) {
    return {
      title: '两驱已满足当前路线',
      body: '当前路线不含 F-road，两驱小型车即可通行且成本更低。',
      advice: '加入高地路线后需重新选车',
    };
  }
  if (ctx.routeFacts.containsFRoad || ctx.routeFacts.highlandRoute) {
    return {
      title: '路线含高地路段',
      body: '当前路线含 F-road / 高地，两驱无法满足通行要求。',
      advice: '优先选四驱或放弃高地',
    };
  }
  return {
    title: '车型匹配当前路线',
    body: ctx.confirmedFacts[0] ?? '请按道路准入与成本比较车型。',
    advice: `优先选「${rec}」；路线变化后重验`,
  };
}
