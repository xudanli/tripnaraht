/**
 * Decision queue left-rail display — short titles, scope, category (aligned with planning-conflicts).
 */

import type { DecisionDimension } from '../contracts/unified-decision-ui.types';
import type { PlanningConflictCategory } from '../../../trips/trip-constraint-solver/types/planning-conflicts.types';
import type { FeasibilityIssueDto } from '../../../trips/trip-constraint-solver/types/trip-constraint-solver.types';
import type {
  DecisionProblemDetail,
  DecisionProblemSummary,
} from '../../../trips/decision-semantics/types/decision-semantics.types';
import {
  buildAffectedScopeSummary,
  buildTravelScopeBffFields,
  parseScopeSummaryFromMessage,
} from '../../../trips/trip-constraint-solver/utils/travel-scope-bff.util';
import { isPlanObjectFeasibilityIssue } from '../../constraints/utils/plan-object-repair-options.util';

export const PLANNING_CONFLICT_CATEGORY_LABELS: Record<PlanningConflictCategory, string> = {
  schedule: '日程',
  transport: '交通',
  team_fit: '团队',
  access_capacity: '准入',
  booking: '开放预订',
  structure: '行程结构',
  environment: '环境',
  experience_expectation: '其他',
  other: '其他',
};

const DIMENSION_TO_CATEGORY: Record<DecisionDimension, PlanningConflictCategory> = {
  SCHEDULE: 'schedule',
  TRANSPORT: 'transport',
  BOOKING: 'booking',
  ENVIRONMENT: 'environment',
  TEAM_FIT: 'team_fit',
  STRUCTURE: 'structure',
  ACCESS_CAPACITY: 'access_capacity',
  EXPERIENCE: 'experience_expectation',
  BUDGET: 'booking',
  OTHER: 'other',
};

const SEMANTIC_SHORT_TITLES: Record<string, string> = {
  INSUFFICIENT_TRANSFER_BUFFER: '交通缓冲偏紧',
  EXCESSIVE_DAILY_LOAD: '当日驾驶负荷偏高',
  DUPLICATE_ITINERARY_ITEM: '重复行程项',
  ITINERARY_COVERAGE_GAP: '行程覆盖不足',
  ROAD_SEGMENT_UNAVAILABLE: '道路不可用',
  ROAD_SEGMENT_RESTRICTED: '道路受限',
  WEATHER_ACTIVITY_PROHIBITED: '天气活动风险',
  WEATHER_ROUTE_RISK: '天气路线风险',
  POI_UNAVAILABLE: 'POI 不可用',
  TIME_WINDOW_INFEASIBLE: '时间窗冲突',
  READINESS_SAFETY_EMERGENCY: '紧急安全提醒',
};

const ISSUE_KIND_SHORT_TITLES: Record<string, string> = {
  buffer_insufficient: '交通缓冲偏紧',
  transfer_buffer: '交通缓冲偏紧',
  same_day_travel: '同日交通偏紧',
};

const RULE_ID_SHORT_TITLES: Record<string, string> = {
  MEAL_WINDOW_VS_ARRIVAL: '午餐窗冲突',
  MEAL_WINDOW_GAP: '午餐空闲不足',
  BUFFER_LINKAGE: '活动缓冲不足',
  DAILY_FATIGUE_LOAD: '当日疲劳偏高',
  TRANSFER_DAILY_LOAD: '当日转移偏多',
  STAY_LINKAGE: '住宿衔接不完整',
};

export function mapDimensionToPlanningCategory(
  dimension: DecisionDimension,
): PlanningConflictCategory {
  return DIMENSION_TO_CATEGORY[dimension] ?? 'other';
}

export function resolvePlanningCategory(input: {
  issue?: FeasibilityIssueDto;
  dimension: DecisionDimension;
  detail?: DecisionProblemDetail;
}): PlanningConflictCategory {
  if (input.issue?.category) {
    const cat = String(input.issue.category).toLowerCase();
    if (cat in PLANNING_CONFLICT_CATEGORY_LABELS) {
      return cat as PlanningConflictCategory;
    }
    if (cat === 'pace' || cat === 'accommodation') return 'schedule';
  }
  if (input.detail?.assertions[0]?.domain === 'ROUTE') return 'transport';
  if (input.detail?.assertions[0]?.domain === 'TIME') return 'schedule';
  return mapDimensionToPlanningCategory(input.dimension);
}

export function categoryLabelFor(category: PlanningConflictCategory): string {
  return PLANNING_CONFLICT_CATEGORY_LABELS[category] ?? PLANNING_CONFLICT_CATEGORY_LABELS.other;
}

export function looksLikeDiagnosticTitle(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  return /预计|晚于|结束于|不足\s*\d+|→|合计\s*\d+\s*分钟/.test(t);
}

export function resolveShortQueueTitle(input: {
  semanticKey?: string;
  issueKind?: string;
  ruleId?: string;
  dimension: DecisionDimension;
  rawTitle?: string;
  rawSummary?: string;
}): string {
  const semanticBase = input.semanticKey?.split(':')[0];
  if (semanticBase && SEMANTIC_SHORT_TITLES[semanticBase]) {
    return SEMANTIC_SHORT_TITLES[semanticBase];
  }
  if (input.issueKind && ISSUE_KIND_SHORT_TITLES[input.issueKind]) {
    return ISSUE_KIND_SHORT_TITLES[input.issueKind];
  }
  if (input.ruleId && RULE_ID_SHORT_TITLES[input.ruleId]) {
    return RULE_ID_SHORT_TITLES[input.ruleId];
  }
  if (isPlanObjectFeasibilityIssue({ semanticKey: input.semanticKey, id: input.semanticKey ?? '' } as FeasibilityIssueDto)) {
    const kind = input.ruleId ?? input.issueKind;
    if (kind && RULE_ID_SHORT_TITLES[kind]) return RULE_ID_SHORT_TITLES[kind];
    if (input.semanticKey?.includes('meal_late')) return '午餐窗冲突';
    if (input.semanticKey?.includes('meal_gap')) return '午餐空闲不足';
    if (input.semanticKey?.includes('buffer')) return '活动缓冲不足';
  }
  const raw = input.rawTitle?.trim() ?? '';
  if (raw && !looksLikeDiagnosticTitle(raw)) return raw;
  const fromSummary = input.rawSummary?.trim() ?? '';
  if (fromSummary && !looksLikeDiagnosticTitle(fromSummary)) return fromSummary;
  return mapDimensionToPlanningCategory(input.dimension) === 'transport'
    ? '交通冲突'
    : mapDimensionToPlanningCategory(input.dimension) === 'schedule'
      ? '日程冲突'
      : '待处理事项';
}

function parsePoiLabelFromDiagnosticMessage(message?: string): string | undefined {
  if (!message) return undefined;
  const meal = message.match(/预计\s+(.+?)\s+结束于/);
  if (meal?.[1]) return meal[1].trim();
  const stay = message.match(/Day\s+\d+\s+(.+?)，/);
  if (stay?.[1]) return stay[1].trim();
  return undefined;
}

function parseDayFromSemanticKey(key?: string): number[] {
  if (!key) return [];
  const patterns = [/_day_(\d+)/i, /day[_-](\d+)/i, /meal_late_arrival_po_[^_]+_(\d+)/i];
  for (const pattern of patterns) {
    const match = pattern.exec(key);
    if (match?.[1]) {
      const day = Number(match[1]);
      if (Number.isFinite(day) && day > 0) return [day];
    }
  }
  return [];
}

function parseDayFromDiagnosticMessage(message?: string): number[] {
  if (!message) return [];
  const days = new Set<number>();
  for (const match of message.matchAll(/第\s*(\d+)\s*天/g)) {
    const day = Number(match[1]);
    if (Number.isFinite(day) && day > 0) days.add(day);
  }
  for (const match of message.matchAll(/\bDay\s+(\d+)\b/gi)) {
    const day = Number(match[1]);
    if (Number.isFinite(day) && day > 0) days.add(day);
  }
  return [...days].sort((a, b) => a - b);
}

function parseDayFromTripDayId(tripDayId?: string): number[] {
  if (!tripDayId) return [];
  const match = /day-(\d+)/i.exec(tripDayId);
  if (!match?.[1]) return [];
  const day = Number(match[1]);
  return Number.isFinite(day) && day > 0 ? [day] : [];
}

export function resolveAffectedDayNumbers(input: {
  issue?: FeasibilityIssueDto;
  scopeDayIds?: number[];
  detail?: DecisionProblemDetail | DecisionProblemSummary;
  diagnosticMessage?: string;
  semanticKey?: string;
  ruleId?: string;
}): number[] {
  const days = new Set<number>();
  for (const d of input.issue?.affectedDayNumbers ?? []) {
    if (Number.isFinite(d) && d > 0) days.add(d);
  }
  for (const d of input.issue?.affectedDays ?? []) {
    if (Number.isFinite(d) && d > 0) days.add(d);
  }
  for (const d of parseDayFromTripDayId(input.issue?.tripDayId)) days.add(d);
  if (input.issue?.anchors?.toDayNumber != null && input.issue.anchors.toDayNumber > 0) {
    days.add(input.issue.anchors.toDayNumber);
  }
  if (input.issue?.anchors?.fromDayNumber != null && input.issue.anchors.fromDayNumber > 0) {
    days.add(input.issue.anchors.fromDayNumber);
  }
  for (const d of input.scopeDayIds ?? []) {
    if (Number.isFinite(d) && d > 0) days.add(d);
  }
  if ('affectedScope' in (input.detail ?? {})) {
    for (const scope of (input.detail as DecisionProblemDetail).affectedScope ?? []) {
      if (scope.scopeType === 'DAY') {
        const n = Number(scope.scopeId);
        if (Number.isFinite(n) && n > 0) days.add(n);
      }
    }
  }
  if (input.detail && 'affectedDayNumbers' in input.detail) {
    for (const d of (input.detail as DecisionProblemSummary).affectedDayNumbers ?? []) {
      if (Number.isFinite(d) && d > 0) days.add(d);
    }
  }
  const message =
    input.diagnosticMessage ??
    input.issue?.message ??
    (input.detail && 'description' in input.detail
      ? input.detail.description
      : undefined);
  for (const d of parseDayFromDiagnosticMessage(message)) days.add(d);
  for (const d of parseDayFromSemanticKey(input.semanticKey ?? input.issue?.semanticKey)) {
    days.add(d);
  }
  return [...days].sort((a, b) => a - b);
}

export function resolveAffectedScopeSummary(input: {
  issue?: FeasibilityIssueDto;
  diagnosticMessage?: string;
}): string {
  if (input.issue?.affectedScopeSummary?.trim()) {
    return input.issue.affectedScopeSummary.trim();
  }
  const travelFields = input.issue
    ? buildTravelScopeBffFields({
        issueKind: input.issue.issueKind,
        affectedDays: input.issue.affectedDays,
        message: input.issue.message,
        anchors: input.issue.anchors,
      })
    : undefined;
  if (travelFields?.affectedScopeSummary?.trim()) {
    return travelFields.affectedScopeSummary.trim();
  }
  const fromAnchors = buildAffectedScopeSummary(
    input.issue?.anchors?.fromPlaceLabel,
    input.issue?.anchors?.toPlaceLabel,
  );
  if (fromAnchors) return fromAnchors;

  const message = input.diagnosticMessage ?? input.issue?.message;
  const fromMessage =
    parseScopeSummaryFromMessage(message) ?? parsePoiLabelFromDiagnosticMessage(message);
  return fromMessage?.trim() ?? '';
}

export function resolveQueueDescription(input: {
  issue?: FeasibilityIssueDto;
  detail?: DecisionProblemDetail;
  rawSummary?: string;
  rawTitle?: string;
}): string {
  if (input.issue?.message?.trim()) return input.issue.message.trim();
  if (input.detail?.description?.trim()) return input.detail.description.trim();
  const summary = input.rawSummary?.trim();
  if (summary) return summary;
  return input.rawTitle?.trim() ?? '';
}

export function resolvePlanObjectShortTitle(input: {
  ruleId?: string;
  semanticKey?: string;
}): string | undefined {
  const kind = input.ruleId ?? input.semanticKey;
  if (kind && RULE_ID_SHORT_TITLES[kind]) return RULE_ID_SHORT_TITLES[kind];
  if (input.semanticKey?.includes('meal_late')) return '午餐窗冲突';
  if (input.semanticKey?.includes('meal_gap')) return '午餐空闲不足';
  if (input.semanticKey?.includes('buffer_day')) return '活动缓冲不足';
  if (input.semanticKey?.includes('fatigue_day')) return '当日疲劳偏高';
  if (input.semanticKey?.includes('transfer_load')) return '当日转移偏多';
  if (input.semanticKey?.includes('stay_')) return '住宿衔接不完整';
  return undefined;
}

export function resolveFeasibilityDiagnosisOccurrenceCount(issues: FeasibilityIssueDto[]): number {
  return issues.length;
}
