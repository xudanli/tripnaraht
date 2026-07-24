/**
 * Product Catalog bindings → FeasibilityIssueDto（纯函数）
 */

import type { FeasibilityIssueDto } from '../../trips/trip-constraint-solver/types/trip-constraint-solver.types';
import {
  evaluateProductCatalogConstraints,
  type EvaluateProductCatalogConstraintsInput,
  type ProductCatalogConstraintViolation,
} from './evaluate-product-catalog-constraints.util';

export interface ProductBoundItineraryItemInput {
  itemId: string;
  dayNumber: number;
  tripDayId?: string;
  /** Activity window HH:mm */
  itemStartLocal?: string | null;
  itemEndLocal?: string | null;
  /** Planned arrival at meeting point HH:mm */
  arriveLocal?: string | null;
  travelFromPreviousMinutes?: number | null;
  session?: {
    meetTimeLocal?: string | null;
    startTimeLocal?: string | null;
    endTimeLocal?: string | null;
    status?: string | null;
    weatherStatus?: string | null;
  } | null;
  offering?: {
    minAge?: number | null;
    maxAge?: number | null;
    maxWeightKg?: number | null;
    fitnessRequirement?: string | null;
  } | null;
  weatherDependency?: string | null;
  hasFallbackPlan?: boolean;
  participants?: EvaluateProductCatalogConstraintsInput['participants'];
  offeringId?: string | null;
  sessionId?: string | null;
}

const TITLE_BY_KEY: Record<ProductCatalogConstraintViolation['constraintKey'], string> = {
  PRODUCT_SESSION_TIME_WINDOW: '产品班次时间窗冲突',
  MEETING_POINT_BUFFER: '集合点交通缓冲不足',
  PRODUCT_PARTICIPANT_ELIGIBILITY: '产品参与资格不满足',
  PRODUCT_WEATHER_DEPENDENCY: '产品天气依赖风险',
};

const SEMANTIC_BY_KEY: Record<ProductCatalogConstraintViolation['constraintKey'], string> = {
  PRODUCT_SESSION_TIME_WINDOW: 'PRODUCT_SESSION_LOCK_VIOLATION',
  MEETING_POINT_BUFFER: 'MEETING_POINT_BUFFER_INSUFFICIENT',
  PRODUCT_PARTICIPANT_ELIGIBILITY: 'PRODUCT_ELIGIBILITY_FAILED',
  PRODUCT_WEATHER_DEPENDENCY: 'PRODUCT_WEATHER_HOLD_REQUIRED',
};

const ISSUE_KIND_BY_KEY: Record<ProductCatalogConstraintViolation['constraintKey'], string> = {
  PRODUCT_SESSION_TIME_WINDOW: 'product_session_time_window',
  MEETING_POINT_BUFFER: 'meeting_point_buffer',
  PRODUCT_PARTICIPANT_ELIGIBILITY: 'product_participant_eligibility',
  PRODUCT_WEATHER_DEPENDENCY: 'product_weather_dependency',
};

function formatIsoTimeLocal(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const m = /(\d{2}):(\d{2})/.exec(value);
    return m ? `${m[1]}:${m[2]}` : null;
  }
  const hh = value.getUTCHours();
  const mm = value.getUTCMinutes();
  // Prefer local wall-clock if Date was stored as naive local via ISO without Z — callers should pass HH:mm
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

export function violationToFeasibilityIssue(
  item: ProductBoundItineraryItemInput,
  violation: ProductCatalogConstraintViolation,
  tripId: string,
): FeasibilityIssueDto {
  const severity =
    violation.severity === 'BLOCK' ? ('high' as const) : ('medium' as const);
  const priority =
    violation.severity === 'BLOCK'
      ? ('must_handle' as const)
      : ('suggest_adjust' as const);

  return {
    id: `issue-product-${violation.constraintKey}-${item.itemId}`,
    semanticKey: SEMANTIC_BY_KEY[violation.constraintKey],
    priority,
    category: 'schedule',
    title: TITLE_BY_KEY[violation.constraintKey],
    message: violation.message,
    affectedDays: [item.dayNumber],
    affectedDayNumbers: [item.dayNumber],
    tripDayId: item.tripDayId,
    severity,
    issueKind: ISSUE_KIND_BY_KEY[violation.constraintKey],
    fromItemId: item.itemId,
    actionRequired:
      violation.severity === 'BLOCK' ? 'ADJUST_SCHEDULE_OR_PRODUCT' : 'CONFIRM_FALLBACK',
    proofs: [
      {
        entity: `itinerary_item:${item.itemId}`,
        constraint: violation.ruleId,
        currentFact: violation.message,
        evidenceSource: 'travel_product_catalog',
        ruleId: violation.ruleId,
        confidence: 0.9,
        evidenceType: 'product_catalog',
        conclusion: violation.severity === 'BLOCK' ? 'violated' : 'at_risk',
        semanticKey: SEMANTIC_BY_KEY[violation.constraintKey],
      },
    ],
    anchors: {
      fromItemId: item.itemId,
      fromDayNumber: item.dayNumber,
      activityStartAt: item.itemStartLocal ?? undefined,
      arriveAt: item.arriveLocal ?? undefined,
      travelMinutes: item.travelFromPreviousMinutes ?? undefined,
    },
  };
}

export function buildProductCatalogFeasibilityIssues(
  tripId: string,
  items: ProductBoundItineraryItemInput[],
): FeasibilityIssueDto[] {
  const issues: FeasibilityIssueDto[] = [];
  for (const item of items) {
    if (!item.session && !item.offering) continue;
    const violations = evaluateProductCatalogConstraints({
      itemStartLocal: item.itemStartLocal,
      itemEndLocal: item.itemEndLocal,
      arriveLocal: item.arriveLocal,
      session: item.session,
      travelFromPreviousMinutes: item.travelFromPreviousMinutes,
      offering: item.offering,
      weatherDependency: item.weatherDependency,
      hasFallbackPlan: item.hasFallbackPlan ?? false,
      participants: item.participants,
    });
    for (const v of violations) {
      issues.push(violationToFeasibilityIssue(item, v, tripId));
    }
  }
  return issues;
}

/** Map Prisma-ish row → evaluator input (keeps service thin) */
export function mapBoundItemRowToInput(row: {
  id: string;
  dayNumber: number;
  tripDayId?: string;
  startTime?: Date | string | null;
  endTime?: Date | string | null;
  travelFromPreviousDuration?: number | null;
  productOfferingId?: string | null;
  productSessionId?: string | null;
  note?: string | null;
  ProductSession?: {
    meetTimeLocal?: string | null;
    startTimeLocal?: string | null;
    endTimeLocal?: string | null;
    status?: string | null;
    weatherStatus?: string | null;
  } | null;
  ProductOffering?: {
    minAge?: number | null;
    maxAge?: number | null;
    maxWeightKg?: number | null;
    fitnessRequirement?: string | null;
  } | null;
  ExperienceDefinition?: {
    weatherDependency?: string | null;
  } | null;
}): ProductBoundItineraryItemInput {
  let hasFallbackPlan = false;
  let arriveLocal: string | null = null;
  if (row.note) {
    try {
      const parsed = JSON.parse(row.note) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        if (parsed.hasFallbackPlan === true) hasFallbackPlan = true;
        if (typeof parsed.arriveLocal === 'string') arriveLocal = parsed.arriveLocal;
        if (typeof parsed.meetArriveLocal === 'string') arriveLocal = parsed.meetArriveLocal;
      }
    } catch {
      // note is free text — ignore
    }
  }
  if (!arriveLocal && row.ProductSession?.meetTimeLocal) {
    arriveLocal = row.ProductSession.meetTimeLocal;
  }

  return {
    itemId: row.id,
    dayNumber: row.dayNumber,
    tripDayId: row.tripDayId,
    itemStartLocal:
      row.ProductSession?.startTimeLocal ?? formatIsoTimeLocal(row.startTime),
    itemEndLocal: row.ProductSession?.endTimeLocal ?? formatIsoTimeLocal(row.endTime),
    arriveLocal,
    travelFromPreviousMinutes: row.travelFromPreviousDuration ?? null,
    session: row.ProductSession ?? null,
    offering: row.ProductOffering ?? null,
    weatherDependency: row.ExperienceDefinition?.weatherDependency ?? null,
    hasFallbackPlan,
    offeringId: row.productOfferingId,
    sessionId: row.productSessionId,
  };
}
