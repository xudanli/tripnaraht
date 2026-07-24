import type { DayAssessmentDto, DimensionAssessmentDto } from '../dto/trip-metrics.dto';
import {
  AssessmentDimension,
  AssessmentGrade,
  AssessmentStatus,
} from '../dto/trip-metrics.dto';
import type { PlanningConflictItem } from '../trip-constraint-solver/types/planning-conflicts.types';
import { DateTime } from 'luxon';
import {
  isActiveAssessmentDay,
  scoreToAssessmentGrade,
  scoreToAssessmentStatus,
} from './trip-assessment-aggregate.util';

export type TripDayIndexMaps = {
  indexToDate: Map<number, string>;
  dateToIndex: Map<string, number>;
  dayIdToDate: Map<string, string>;
  itemIdToDate: Map<string, string>;
};

export function buildTripDayIndexMaps(
  tripDays: Array<{
    id: string;
    date: Date;
    ItineraryItem?: Array<{ id: string }>;
  }>,
): TripDayIndexMaps {
  const sorted = [...tripDays].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const indexToDate = new Map<number, string>();
  const dateToIndex = new Map<string, number>();
  const dayIdToDate = new Map<string, string>();
  const itemIdToDate = new Map<string, string>();

  sorted.forEach((day, idx) => {
    const iso = DateTime.fromJSDate(day.date).toISODate() ?? day.date.toISOString().slice(0, 10);
    const dayIndex = idx + 1;
    indexToDate.set(dayIndex, iso);
    dateToIndex.set(iso, dayIndex);
    dayIdToDate.set(day.id, iso);
    for (const item of day.ItineraryItem ?? []) {
      itemIdToDate.set(item.id, iso);
    }
  });

  return { indexToDate, dateToIndex, dayIdToDate, itemIdToDate };
}

export function resolvePlanningConflictDates(
  item: PlanningConflictItem,
  maps: TripDayIndexMaps,
): string[] {
  const dates = new Set<string>();

  for (const dayNum of item.affectedDays ?? []) {
    const iso = maps.indexToDate.get(dayNum);
    if (iso) dates.add(iso);
  }

  const issue = item.issue;
  if (issue?.tripDayId) {
    const iso = maps.dayIdToDate.get(issue.tripDayId);
    if (iso) dates.add(iso);
  }

  for (const dayNum of issue?.affectedDays ?? []) {
    const iso = maps.indexToDate.get(dayNum);
    if (iso) dates.add(iso);
  }

  const itemIds = [
    issue?.fromItemId,
    issue?.toItemId,
    ...(issue?.proofs?.map((p) => p.itemId) ?? []),
    item.studioConflict?.fromItemId,
    item.studioConflict?.toItemId,
    ...(item.studioConflict?.affectedItemIds ?? []),
  ].filter(Boolean) as string[];

  for (const id of itemIds) {
    const iso = maps.itemIdToDate.get(id);
    if (iso) dates.add(iso);
  }

  return [...dates];
}

export function groupPlanningConflictsByDate(
  items: PlanningConflictItem[],
  maps: TripDayIndexMaps,
): Map<string, PlanningConflictItem[]> {
  const byDate = new Map<string, PlanningConflictItem[]>();

  for (const item of items) {
    const dates = resolvePlanningConflictDates(item, maps);
    if (dates.length === 0) {
      const bucket = byDate.get('*') ?? [];
      bucket.push(item);
      byDate.set('*', bucket);
      continue;
    }
    for (const date of dates) {
      const bucket = byDate.get(date) ?? [];
      bucket.push(item);
      byDate.set(date, bucket);
    }
  }

  return byDate;
}

export function groupMustHandleByDate(
  items: PlanningConflictItem[],
  maps: TripDayIndexMaps,
): Map<string, PlanningConflictItem[]> {
  return groupPlanningConflictsByDate(
    items.filter((item) => item.priority === 'must_handle'),
    maps,
  );
}

export function partitionPlanningConflicts(items: PlanningConflictItem[]) {
  return {
    must: items.filter((i) => i.priority === 'must_handle'),
    suggest: items.filter((i) => i.priority === 'suggest_adjust'),
    pending: items.filter((i) => i.priority === 'pending_confirm'),
  };
}

const CONFLICT_PRIORITY_RANK: Record<PlanningConflictItem['priority'], number> = {
  must_handle: 3,
  suggest_adjust: 2,
  pending_confirm: 1,
};

function normalizeConflictTitle(title: string): string {
  return title
    .replace(/（约[^）]+）/g, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

export function conflictDedupeKey(item: PlanningConflictItem): string {
  if (item.semanticKey) return item.semanticKey;
  if (item.issue?.semanticKey) return item.issue.semanticKey;
  return normalizeConflictTitle(item.title);
}

/** 同日冲突去重：同一 semanticKey/title 保留更高 priority */
export function dedupePlanningConflictItems(items: PlanningConflictItem[]): PlanningConflictItem[] {
  const byKey = new Map<string, PlanningConflictItem>();

  for (const item of items) {
    const key = conflictDedupeKey(item);
    const existing = byKey.get(key);
    if (
      !existing ||
      (CONFLICT_PRIORITY_RANK[item.priority] ?? 0) > (CONFLICT_PRIORITY_RANK[existing.priority] ?? 0)
    ) {
      byKey.set(key, item);
    }
  }

  return [...byKey.values()];
}

export function buildFeasibilityDimensionAssessment(
  items: PlanningConflictItem[],
): DimensionAssessmentDto {
  const deduped = dedupePlanningConflictItems(items);
  const { must, suggest, pending } = partitionPlanningConflicts(deduped);
  const issues: string[] = [
    ...new Set([
      ...must.map((i) => `[必须处理] ${i.title}`),
      ...suggest.map((i) => `[建议调整] ${i.title}`),
      ...pending.map((i) => `[待确认] ${i.title}`),
    ]),
  ];
  const suggestions = [
    ...must.map((i) => i.message),
    ...suggest.map((i) => i.message),
  ].filter(Boolean);

  let score = 100;
  let description = '规划可执行性良好';
  if (must.length > 0) {
    score = 35;
    description = `存在 ${must.length} 项必须处理的规划冲突`;
  } else if (suggest.length > 0) {
    score = 60;
    description = `存在 ${suggest.length} 项建议调整的规划冲突`;
  } else if (pending.length > 0) {
    score = 82;
    description = `存在 ${pending.length} 项待确认的规划事项`;
  }

  const grade = scoreToAssessmentGrade(score);
  return {
    dimension: AssessmentDimension.FEASIBILITY,
    name: '规划可执行性',
    score,
    grade,
    passed: must.length === 0 && suggest.length === 0,
    description,
    issues: issues.length ? issues : undefined,
    suggestions: suggestions.length ? suggestions.slice(0, 3) : undefined,
  };
}

export function computeWeightedDayOverallScore(dimensions: DimensionAssessmentDto[]): number {
  const mealsDim = dimensions.find((d) => d.dimension === AssessmentDimension.MEALS);
  const mealsHasIssues = Boolean(mealsDim?.issues && mealsDim.issues.length > 0);
  const feasibilityDim = dimensions.find((d) => d.dimension === AssessmentDimension.FEASIBILITY);
  const feasibilityScore = feasibilityDim?.score ?? 100;

  const weights: Partial<Record<AssessmentDimension, number>> = {
    [AssessmentDimension.TIMING]: 1.5,
    [AssessmentDimension.DENSITY]: 1.5,
    [AssessmentDimension.GEOGRAPHY]: 1.5,
    [AssessmentDimension.TRANSPORT]: 1.2,
    [AssessmentDimension.BUFFER]: 1.2,
    [AssessmentDimension.PHYSICAL]: 1.0,
    [AssessmentDimension.MEALS]: mealsHasIssues ? 1.2 : 0.5,
  };

  if (feasibilityDim) {
    if (feasibilityScore <= 40) {
      weights[AssessmentDimension.FEASIBILITY] = 2.0;
    } else if (feasibilityScore <= 65) {
      weights[AssessmentDimension.FEASIBILITY] = 1.5;
    } else {
      weights[AssessmentDimension.FEASIBILITY] = 0.8;
    }
  }

  let totalWeight = 0;
  let weightedSum = 0;
  for (const dim of dimensions) {
    const weight = weights[dim.dimension] ?? 1;
    weightedSum += dim.score * weight;
    totalWeight += weight;
  }

  return totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
}

/** 注入 FEASIBILITY 维度并按冲突优先级做状态降级 */
export function integratePlanningConflictsIntoDay(
  day: DayAssessmentDto,
  conflicts: PlanningConflictItem[],
): DayAssessmentDto {
  const deduped = dedupePlanningConflictItems(conflicts);
  if (!deduped.length || !isActiveAssessmentDay(day)) {
    return day;
  }

  const { must, suggest, pending } = partitionPlanningConflicts(deduped);
  const dimensions = (day.dimensions ?? []).filter(
    (d) => d.dimension !== AssessmentDimension.FEASIBILITY,
  );
  dimensions.push(buildFeasibilityDimensionAssessment(deduped));

  let overallScore = computeWeightedDayOverallScore(dimensions);
  let status = scoreToAssessmentStatus(overallScore);
  let isReasonable = status === AssessmentStatus.REASONABLE;

  if (must.length > 0) {
    overallScore = Math.min(overallScore, 49);
    status = AssessmentStatus.HAS_ISSUES;
    isReasonable = false;
  } else if (suggest.length > 0) {
    overallScore = Math.min(overallScore, 74);
    if (status === AssessmentStatus.REASONABLE) {
      status = AssessmentStatus.NEEDS_ATTENTION;
      isReasonable = false;
    }
  }

  const titles = [
    ...new Set(deduped.map((i) => i.title).filter(Boolean)),
  ];
  const topSuggestion = must[0]?.message ?? suggest[0]?.message ?? day.topSuggestion;
  const conflictNote =
    must.length > 0
      ? `存在 ${must.length} 项必须处理的规划冲突`
      : suggest.length > 0
        ? `存在 ${suggest.length} 项建议调整的规划冲突`
        : `存在 ${pending.length} 项待确认的规划事项`;

  return {
    ...day,
    dimensions,
    overallScore,
    overallGrade: scoreToAssessmentGrade(overallScore),
    status,
    isReasonable,
    criticalIssueCount: day.criticalIssueCount + (must.length > 0 ? 1 : 0),
    warningCount: day.warningCount + suggest.length + pending.length,
    planningConflicts: {
      mustHandleCount: must.length,
      suggestAdjustCount: suggest.length,
      pendingConfirmCount: pending.length,
      titles,
    },
    topSuggestion,
    summary: day.summary ? `${day.summary}；${conflictNote}` : `${day.date}：${conflictNote}`,
  };
}

/** @deprecated 使用 integratePlanningConflictsIntoDay */
export function applyMustHandleDowngradeToDay(
  day: DayAssessmentDto,
  mustItems: PlanningConflictItem[],
): DayAssessmentDto {
  return integratePlanningConflictsIntoDay(day, mustItems);
}

export type IntegratePlanningConflictsResult = {
  days: DayAssessmentDto[];
  tripWideConflicts: PlanningConflictItem[];
};

/** 仅将带日期的冲突写入当日；无日期（*）的行程级冲突单独返回，不污染每一天 */
export function integratePlanningConflictsIntoDays(
  days: DayAssessmentDto[],
  byDate: Map<string, PlanningConflictItem[]>,
): IntegratePlanningConflictsResult {
  const tripWideConflicts = dedupePlanningConflictItems(byDate.get('*') ?? []);
  const scoped = new Map(byDate);
  scoped.delete('*');

  if (scoped.size === 0 && tripWideConflicts.length === 0) {
    return { days, tripWideConflicts: [] };
  }

  const adjustedDays = days.map((day) => {
    const conflicts = scoped.get(day.date) ?? [];
    return integratePlanningConflictsIntoDay(day, conflicts);
  });

  return { days: adjustedDays, tripWideConflicts };
}

/** @deprecated 使用 integratePlanningConflictsIntoDays */
export function applyPlanningConflictDowngrades(
  days: DayAssessmentDto[],
  mustByDate: Map<string, PlanningConflictItem[]>,
  tripWideMust: PlanningConflictItem[],
): DayAssessmentDto[] {
  if (tripWideMust.length > 0) {
    const merged = new Map(mustByDate);
    const unscoped = merged.get('*') ?? [];
    merged.set('*', [...unscoped, ...tripWideMust]);
    return integratePlanningConflictsIntoDays(days, merged).days;
  }
  return integratePlanningConflictsIntoDays(days, mustByDate).days;
}

/** 行程级 must_handle > 0 时整体不超过 FAIR；仅 suggest_adjust 时不超过 GOOD */
export function capTripGradeForPlanningConflicts(
  overallAverageScore: number,
  summary: { mustHandle: number; suggestAdjust: number },
): { overallAverageScore: number; overallGrade: AssessmentGrade } {
  let cappedScore = overallAverageScore;
  if (summary.mustHandle > 0) {
    cappedScore = Math.min(cappedScore, 74);
  } else if (summary.suggestAdjust > 0) {
    cappedScore = Math.min(cappedScore, 89);
  }
  return {
    overallAverageScore: cappedScore,
    overallGrade: scoreToAssessmentGrade(cappedScore),
  };
}

/** @deprecated 使用 capTripGradeForPlanningConflicts */
export function capTripGradeForMustHandle(
  overallAverageScore: number,
  mustHandleCount: number,
): { overallAverageScore: number; overallGrade: AssessmentGrade } {
  return capTripGradeForPlanningConflicts(overallAverageScore, {
    mustHandle: mustHandleCount,
    suggestAdjust: 0,
  });
}

export type AssessPlanningConflictsSummary = {
  total: number;
  mustHandle: number;
  suggestAdjust: number;
  pendingConfirm: number;
  verdictStatus?: string;
};

export type AssessPlanningConflictItem = {
  id: string;
  title: string;
  message: string;
  category: string;
  affectedDays?: number[];
  priority: PlanningConflictItem['priority'];
};

export type AssessPlanningConflictsPayload = {
  summary: AssessPlanningConflictsSummary;
  mustHandleItems: AssessPlanningConflictItem[];
  suggestAdjustItems: AssessPlanningConflictItem[];
  tripWideItems: AssessPlanningConflictItem[];
};

function mapAssessConflictItem(i: PlanningConflictItem): AssessPlanningConflictItem {
  return {
    id: i.id,
    title: i.title,
    message: i.message,
    category: i.category,
    affectedDays: i.affectedDays,
    priority: i.priority,
  };
}

export function buildAssessPlanningConflictsPayload(input: {
  summary: AssessPlanningConflictsSummary;
  items: PlanningConflictItem[];
  tripWideItems?: PlanningConflictItem[];
  mustLimit?: number;
  suggestLimit?: number;
  tripWideLimit?: number;
}): AssessPlanningConflictsPayload {
  const mustLimit = input.mustLimit ?? 8;
  const suggestLimit = input.suggestLimit ?? 5;
  const tripWideLimit = input.tripWideLimit ?? 5;

  return {
    summary: input.summary,
    mustHandleItems: input.items
      .filter((i) => i.priority === 'must_handle')
      .slice(0, mustLimit)
      .map(mapAssessConflictItem),
    suggestAdjustItems: input.items
      .filter((i) => i.priority === 'suggest_adjust')
      .slice(0, suggestLimit)
      .map(mapAssessConflictItem),
    tripWideItems: dedupePlanningConflictItems(input.tripWideItems ?? [])
      .slice(0, tripWideLimit)
      .map(mapAssessConflictItem),
  };
}
