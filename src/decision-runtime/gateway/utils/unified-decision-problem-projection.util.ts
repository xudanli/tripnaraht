/**
 * Maps legacy / canonical problem rows into the unified UI read model.
 */

import type { DecisionRouteResult } from '../contracts/decision-gateway.types';
import {
  buildDetectorsFromCanonicalProblem,
  buildDetectorsFromLegacyDetail,
  buildDetectorsFromLegacySummary,
  buildOriginFromCanonical,
  buildOriginFromLegacy,
  mergeDetectors,
  mergeOrigins,
} from './decision-problem-detector-projection.util';
import type {
  DecisionDimension,
  DecisionProblemExecutionStatus,
  DecisionProblemOccurrence,
  DecisionProblemOrigin,
  DecisionProblemPhase,
  DecisionProblemScope,
  DecisionProblemWorkflowStatus,
  UnifiedDecisionProblemActionability,
  UnifiedDecisionProblemDebugMeta,
  UnifiedDecisionProblemLegacySummary,
  UnifiedDecisionProblemListItem,
  UnifiedDecisionProblemListView,
  DecisionProblemDetector,
} from '../contracts/unified-decision-ui.types';
import type { CollectedDecisionProblems } from '../../../trips/decision-semantics/collectors/decision-problem.collector';
import type {
  ConstraintEnforcement,
  DecisionProblemDetail,
  DecisionProblemSummary,
  DecisionProblemType,
} from '../../../trips/decision-semantics/types/decision-semantics.types';
import type { FeasibilityIssueDto } from '../../../trips/trip-constraint-solver/types/trip-constraint-solver.types';
import type { PlanningConflictCategory } from '../../../trips/trip-constraint-solver/types/planning-conflicts.types';
import type { Rfc001DecisionCenterProblemView } from '../../../trips/guardian-decision-core/adapters/decision-center-bridge.adapter';
import {
  ENFORCEMENT_ALLOWED_ACTIONS,
  inferEnforcementForQueue,
  isTerminalDecisionWorkflowStatus,
  qualifiesForDecisionQueue,
} from './decision-queue-admission.util';
import {
  categoryLabelFor,
  resolveAffectedDayNumbers,
  resolveAffectedScopeSummary,
  resolvePlanningCategory,
  resolveQueueDescription,
  resolveShortQueueTitle,
} from './decision-problem-queue-display.util';

export interface InternalUnifiedProblemRow {
  problemId: string;
  authority: 'CANONICAL' | 'LEGACY';
  route?: DecisionRouteResult;
  flow?: 'CANONICAL_L2' | 'LEGACY_V15';
  semanticKey: string;
  instanceKey: string;
  type: DecisionProblemType;
  dimension: DecisionDimension;
  enforcement: ConstraintEnforcement;
  phase: DecisionProblemPhase;
  affectsPlan: boolean;
  workflowStatus: DecisionProblemWorkflowStatus;
  executionStatus: DecisionProblemExecutionStatus;
  title: string;
  summary: string;
  scope: DecisionProblemScope;
  evidenceCount: number;
  evidenceFreshness: 'FRESH' | 'STALE' | 'UNKNOWN';
  evidenceConfidence?: number;
  occurrenceCount: number;
  occurrences: DecisionProblemOccurrence[];
  hasExecutableOptions?: boolean;
  sourceIds: string[];
  detectors: DecisionProblemDetector[];
  origin: DecisionProblemOrigin;
  /** Legacy detail or canonical summary for debug only */
  rawLegacy?: DecisionProblemDetail | DecisionProblemSummary;
  rawCanonical?: Rfc001DecisionCenterProblemView;
  linkedIssue?: FeasibilityIssueDto;
  queueTitle?: string;
  queueDescription?: string;
  planningCategory?: PlanningConflictCategory;
  affectedDayNumbers?: number[];
  affectedScopeSummary?: string;
}

const CATEGORY_TO_DIMENSION: Record<string, DecisionDimension> = {
  schedule: 'SCHEDULE',
  transport: 'TRANSPORT',
  booking: 'BOOKING',
  environment: 'ENVIRONMENT',
  team_fit: 'TEAM_FIT',
  structure: 'STRUCTURE',
  access_capacity: 'ACCESS_CAPACITY',
  experience_expectation: 'EXPERIENCE',
  itinerary_completeness: 'STRUCTURE',
  budget: 'BUDGET',
  other: 'OTHER',
};

export function resolveLinkedFeasibilityIssue(
  collected: CollectedDecisionProblems,
  detail: DecisionProblemDetail,
): FeasibilityIssueDto | undefined {
  const direct =
    collected.issueByProblemId.get(detail.id) ??
    (detail.sourceRefs[0]?.refId
      ? collected.issueByProblemId.get(detail.sourceRefs[0].refId)
      : undefined) ??
    (detail.semanticKey ? collected.issueByProblemId.get(detail.semanticKey) : undefined);
  if (direct) return direct;

  return collected.feasibilityIssues.find(
    (issue) =>
      issue.id === detail.sourceRefs[0]?.refId ||
      issue.semanticKey === detail.semanticKey ||
      (detail.semanticKey != null &&
        issue.semanticKey != null &&
        (issue.semanticKey.startsWith(detail.semanticKey) ||
          detail.semanticKey.startsWith(issue.semanticKey))),
  );
}

export function resolveSemanticKeyFromLegacy(
  detail: DecisionProblemDetail | DecisionProblemSummary,
): string {
  if (detail.semanticKey) {
    return detail.semanticKey.split(':')[0] ?? detail.semanticKey;
  }
  const title = 'title' in detail ? detail.title : '';
  if (/紧急电话|emergency/i.test(title)) return 'READINESS_SAFETY_EMERGENCY';
  if (/缓冲|buffer/i.test(title)) return 'INSUFFICIENT_TRANSFER_BUFFER';
  if (/驾驶|daily.?load|daily.?drive/i.test(title)) return 'EXCESSIVE_DAILY_LOAD';
  if (/重复|duplicate/i.test(title)) return 'DUPLICATE_ITINERARY_ITEM';
  if (/coverage|覆盖/i.test(title)) return 'ITINERARY_COVERAGE_GAP';
  return 'LEGACY_DECISION_PROBLEM';
}

export function buildInstanceKey(input: {
  semanticKey: string;
  tripId: string;
  problemId: string;
  scope?: DecisionProblemScope;
}): string {
  const parts = [input.semanticKey, `trip:${input.tripId.slice(0, 8)}`];
  const days = input.scope?.dayIds?.slice().sort((a, b) => a - b);
  if (days?.length) parts.push(`day:${days.join('|')}`);
  if (input.scope?.routeSegmentIds?.length) {
    parts.push(`segment:${input.scope.routeSegmentIds.join('|')}`);
  } else if (input.scope?.itemIds?.length) {
    parts.push(`items:${input.scope.itemIds.slice(0, 3).join('|')}`);
  } else {
    parts.push(`problem:${input.problemId}`);
  }
  return parts.join(':');
}

export function mapCategoryToDimension(category?: string): DecisionDimension {
  if (!category) return 'OTHER';
  return CATEGORY_TO_DIMENSION[category.toLowerCase()] ?? 'OTHER';
}

export function mapLegacyDetailToRow(
  detail: DecisionProblemDetail,
  tripId: string,
  route?: DecisionRouteResult,
  linkedIssue?: FeasibilityIssueDto,
): InternalUnifiedProblemRow {
  const primary = detail.assertions[0];
  const enforcement = inferEnforcementForQueue(primary?.enforcement ?? 'WARN', {
    semanticKey: detail.semanticKey,
    title: detail.title,
    summary: detail.description,
  });
  const semanticKey = resolveSemanticKeyFromLegacy(detail);
  const scope = scopeFromLegacyDetail(detail, tripId);
  const instanceKey = buildInstanceKey({
    semanticKey,
    tripId,
    problemId: detail.id,
    scope,
  });
  const queueDisplay = buildQueueDisplayFields({
    dimension: dimensionFromLegacyDetail(detail),
    semanticKey,
    rawTitle: detail.title,
    rawSummary: detail.description,
    scopeDayIds: scope.dayIds,
    detail,
    linkedIssue,
    ruleId: linkedIssue?.proofs?.[0]?.ruleId ?? linkedIssue?.issueKind,
    issueKind: linkedIssue?.issueKind,
  });

  return {
    problemId: detail.id,
    authority: 'LEGACY',
    route,
    flow: 'LEGACY_V15',
    semanticKey,
    instanceKey,
    type: detail.type,
    dimension: dimensionFromLegacyDetail(detail),
    enforcement,
    phase: 'PLANNING',
    affectsPlan: enforcement !== 'INFORM',
    workflowStatus: detail.status,
    executionStatus: mapWorkflowToExecutionStatus(detail.status),
    title: queueDisplay.queueTitle ?? detail.title,
    summary: queueDisplay.queueDescription ?? detail.description,
    scope,
    evidenceCount: detail.assertions.reduce((n, a) => n + (a.proofs?.length ?? 0), 0),
    evidenceFreshness: 'UNKNOWN',
    occurrenceCount: 1,
    occurrences: occurrencesFromScope(scope, detail.id),
    sourceIds: detail.sourceRefs.map((r) => r.refId),
    detectors: buildDetectorsFromLegacyDetail(detail),
    origin: buildOriginFromLegacy({ authority: 'LEGACY', detail }),
    rawLegacy: detail,
    linkedIssue,
    ...queueDisplay,
  };
}

export function mapLegacySummaryToRow(
  summary: DecisionProblemSummary,
  tripId: string,
  route?: DecisionRouteResult,
): InternalUnifiedProblemRow {
  const enforcement = inferEnforcementForQueue(summary.primaryEnforcement ?? 'WARN', {
    semanticKey: summary.semanticKey,
    title: summary.title,
    summary: summary.title,
  });
  const semanticKey = resolveSemanticKeyFromLegacy(summary);
  const scope: DecisionProblemScope = {
    tripId,
    dayIds: summary.affectedDayNumbers?.length ? [...summary.affectedDayNumbers] : undefined,
  };
  const instanceKey = buildInstanceKey({
    semanticKey,
    tripId,
    problemId: summary.id,
    scope,
  });
  const queueDisplay = buildQueueDisplayFields({
    dimension: 'OTHER',
    semanticKey,
    rawTitle: summary.title,
    rawSummary: summary.title,
    scopeDayIds: scope.dayIds,
    detail: summary,
  });

  return {
    problemId: summary.id,
    authority: 'LEGACY',
    route,
    flow: 'LEGACY_V15',
    semanticKey,
    instanceKey,
    type: summary.type,
    dimension: 'OTHER',
    enforcement,
    phase: 'PLANNING',
    affectsPlan: enforcement !== 'INFORM',
    workflowStatus: summary.status,
    executionStatus: mapWorkflowToExecutionStatus(summary.status),
    title: queueDisplay.queueTitle ?? summary.title,
    summary: queueDisplay.queueDescription ?? summary.title,
    scope,
    evidenceCount: 0,
    evidenceFreshness: 'UNKNOWN',
    occurrenceCount: 1,
    occurrences: occurrencesFromScope(scope, summary.id),
    sourceIds: [summary.id],
    detectors: buildDetectorsFromLegacySummary(summary),
    origin: buildOriginFromLegacy({ authority: 'LEGACY', summary }),
    rawLegacy: summary,
    ...queueDisplay,
  };
}

export function mapCanonicalProblemToRow(
  problem: Rfc001DecisionCenterProblemView,
  tripId: string,
  semanticKey: string,
  route?: DecisionRouteResult,
  linkedIssue?: FeasibilityIssueDto,
): InternalUnifiedProblemRow {
  const summary = problem.problemSummary;
  const cap = problem.rfc001Problem.semanticCapability ?? semanticKey.split(':')[0];
  const dimension =
    cap === 'ROAD_SEGMENT_UNAVAILABLE' || cap === 'ROAD_SEGMENT_RESTRICTED'
      ? 'TRANSPORT'
      : cap === 'WEATHER_ACTIVITY_PROHIBITED' || cap === 'WEATHER_ROUTE_RISK'
        ? 'ENVIRONMENT'
        : cap === 'EXCESSIVE_DAILY_LOAD'
          ? 'SCHEDULE'
          : 'OTHER';

  const enforcement: ConstraintEnforcement =
    cap === 'ROAD_SEGMENT_UNAVAILABLE' || problem.rfc001Problem.type === 'FEASIBILITY_FAILURE'
      ? 'BLOCK'
      : cap === 'EXCESSIVE_DAILY_LOAD'
        ? 'REQUIRE_ADJUSTMENT'
        : 'REQUIRE_CONFIRMATION';

  const scope: DecisionProblemScope = {
    tripId,
    itemIds: problem.rfc001Problem.affectedPlanItemIds?.length
      ? [...problem.rfc001Problem.affectedPlanItemIds]
      : undefined,
    routeSegmentIds: summary.affectedScope
      ?.filter((s) => s.scopeType === 'ROUTE_SEGMENT')
      .map((s) => s.scopeId),
    dayIds: summary.affectedScope
      ?.filter((s) => s.scopeType === 'DAY')
      .map((s) => Number(s.scopeId))
      .filter((n) => Number.isFinite(n)),
  };

  const instanceKey = buildInstanceKey({
    semanticKey: cap ?? semanticKey,
    tripId,
    problemId: problem.problemId,
    scope,
  });

  const workflowStatus = summary.status as DecisionProblemWorkflowStatus;
  const hasExecutableOptions = problem.options.some((o) => o.executable);
  const queueDisplay = buildQueueDisplayFields({
    dimension,
    semanticKey: cap ?? semanticKey,
    rawTitle: summary.title,
    rawSummary: summary.description,
    scopeDayIds: scope.dayIds,
    linkedIssue,
    ruleId: linkedIssue?.proofs?.[0]?.ruleId ?? linkedIssue?.issueKind,
    issueKind: linkedIssue?.issueKind,
  });

  return {
    problemId: problem.problemId,
    authority: 'CANONICAL',
    route,
    flow: 'CANONICAL_L2',
    semanticKey: cap ?? semanticKey,
    instanceKey,
    type: summary.type,
    dimension,
    enforcement,
    phase: 'PLANNING',
    affectsPlan: (problem.rfc001Problem.affectedPlanItemIds?.length ?? 0) > 0,
    workflowStatus,
    executionStatus: mapWorkflowToExecutionStatus(workflowStatus),
    title: queueDisplay.queueTitle ?? summary.title,
    summary: queueDisplay.queueDescription ?? summary.description,
    scope,
    evidenceCount: problem.rfc001Problem.affectedEntityRefs?.length ?? 0,
    evidenceFreshness: 'FRESH',
    occurrenceCount: Math.max(1, problem.rfc001Problem.affectedPlanItemIds?.length ?? 1),
    occurrences: occurrencesFromScope(scope, problem.problemId),
    hasExecutableOptions,
    sourceIds: [problem.rfc001Problem.triggerEventId],
    detectors: buildDetectorsFromCanonicalProblem(problem),
    origin: buildOriginFromCanonical(problem),
    rawCanonical: problem,
    linkedIssue,
    ...queueDisplay,
  };
}

export function aggregateRowsByInstanceKey(rows: InternalUnifiedProblemRow[]): InternalUnifiedProblemRow[] {
  const byKey = new Map<string, InternalUnifiedProblemRow>();
  for (const row of rows) {
    const existing = byKey.get(row.instanceKey);
    if (!existing) {
      byKey.set(row.instanceKey, row);
      continue;
    }
    const primary = pickNewerUnifiedProblemRow(existing, row);
    byKey.set(row.instanceKey, {
      ...primary,
      occurrenceCount: existing.occurrenceCount + row.occurrenceCount,
      occurrences: [...existing.occurrences, ...row.occurrences],
      evidenceCount: existing.evidenceCount + row.evidenceCount,
      hasExecutableOptions: existing.hasExecutableOptions || row.hasExecutableOptions,
      sourceIds: [...new Set([...existing.sourceIds, ...row.sourceIds])],
      detectors: mergeDetectors(existing.detectors, row.detectors),
      origin: mergeOrigins(existing.origin, row.origin),
      affectedDayNumbers: mergeAffectedDayNumbers(existing.affectedDayNumbers, row.affectedDayNumbers),
      affectedScopeSummary: primary.affectedScopeSummary || existing.affectedScopeSummary,
      queueDescription:
        primary.queueDescription && primary.queueDescription !== primary.queueTitle
          ? primary.queueDescription
          : existing.queueDescription ?? primary.queueDescription,
    });
  }
  return [...byKey.values()];
}

/** Same instanceKey merge must expose the latest slip problemId (POST ↔ queue SSOT). */
export function pickNewerUnifiedProblemRow(
  a: InternalUnifiedProblemRow,
  b: InternalUnifiedProblemRow,
): InternalUnifiedProblemRow {
  return unifiedProblemRowRecency(b) >= unifiedProblemRowRecency(a) ? b : a;
}

export function unifiedProblemRowRecency(row: InternalUnifiedProblemRow): number {
  const fromId = parseExecSlipProblemTimestamp(row.problemId);
  if (fromId != null) return fromId;
  const detected = row.rawCanonical?.rfc001Problem?.detectedAt;
  if (detected) {
    const t = Date.parse(detected);
    if (Number.isFinite(t)) return t;
  }
  return 0;
}

export function parseExecSlipProblemTimestamp(problemId: string): number | undefined {
  const match = /^problem_exec_slip_[^_]+_(\d+)$/.exec(problemId);
  if (!match) return undefined;
  const t = Number(match[1]);
  return Number.isFinite(t) ? t : undefined;
}

export function projectRowToListItem(
  row: InternalUnifiedProblemRow,
  includeDebug: boolean,
): UnifiedDecisionProblemListItem {
  const enforcement = inferEnforcementForQueue(row.enforcement, row);
  const actionability = buildActionability(enforcement, row);
  const legacySummary = buildLegacySummaryFromRow(row);
  const item: UnifiedDecisionProblemListItem = {
    problemId: row.problemId,
    semanticKey: row.semanticKey,
    instanceKey: row.instanceKey,
    type: row.type,
    dimension: row.dimension,
    enforcement,
    phase: row.phase,
    affectsPlan: row.affectsPlan,
    workflowStatus: row.workflowStatus,
    executionStatus: row.executionStatus,
    title: row.queueTitle ?? row.title,
    summary: row.queueDescription ?? row.summary,
    categoryLabel: legacySummary.categoryLabel,
    legacySummary,
    impactScopeView: buildImpactScopeView(row),
    scope: {
      ...row.scope,
      dayIds: legacySummary.affectedDayNumbers.length
        ? legacySummary.affectedDayNumbers
        : row.scope.dayIds,
    },
    evidenceSummary: {
      count: row.evidenceCount,
      freshness: row.evidenceFreshness,
      confidence: row.evidenceConfidence,
    },
    actionability,
    occurrenceCount: row.occurrenceCount,
    occurrences: row.occurrences.length > 1 ? row.occurrences : undefined,
    detectors: row.detectors,
    origin: row.origin,
  };

  if (includeDebug) {
    item.debug = buildDebugMeta(row);
  }

  return item;
}

export function buildUnifiedDecisionProblemListView(input: {
  tripId: string;
  rows: InternalUnifiedProblemRow[];
  includeDebug?: boolean;
  queueOnly?: boolean;
  /** Exclude Plan Object assessment during TRAVELING (execution phase). */
  excludePlanObjectForExecution?: boolean;
  /** Raw feasibility diagnosis count — meta.occurrenceCount SSOT */
  diagnosisOccurrenceCount?: number;
}): UnifiedDecisionProblemListView {
  const aggregated = aggregateRowsByInstanceKey(input.rows);
  const filtered = input.queueOnly
    ? aggregated.filter((row) =>
        qualifiesForDecisionQueue({
          enforcement: row.enforcement,
          workflowStatus: row.workflowStatus,
          problemId: row.problemId,
          semanticKey: row.semanticKey,
          title: row.title,
          summary: row.summary,
          hasExecutableOptions: row.hasExecutableOptions,
          blocksPlan: row.enforcement === 'BLOCK',
          requiresAdjustment: row.enforcement === 'REQUIRE_ADJUSTMENT',
          requiresConfirmation: row.enforcement === 'REQUIRE_CONFIRMATION',
          excludePlanObjectPlanning: input.excludePlanObjectForExecution === true,
        }),
      )
    : aggregated;

  const items = filtered.map((row) => projectRowToListItem(row, input.includeDebug === true));
  const byEnforcement: Partial<Record<ConstraintEnforcement, number>> = {};
  let occurrenceCount = 0;
  let actionableCount = 0;
  let openCount = 0;

  for (const item of items) {
    if (!isTerminalDecisionWorkflowStatus(item.workflowStatus)) {
      openCount += 1;
      byEnforcement[item.enforcement] = (byEnforcement[item.enforcement] ?? 0) + 1;
      occurrenceCount += item.occurrenceCount;
      if (item.actionability.requiresAction) actionableCount += 1;
    }
  }

  return {
    schemaId: 'tripnara.unified_decision_problems@v2',
    tripId: input.tripId,
    generatedAt: new Date().toISOString(),
    meta: {
      total: items.length,
      openCount,
      actionableCount,
      occurrenceCount: input.diagnosisOccurrenceCount ?? occurrenceCount,
      byEnforcement,
    },
    items,
  };
}

function buildQueueDisplayFields(input: {
  dimension: DecisionDimension;
  semanticKey: string;
  rawTitle: string;
  rawSummary: string;
  scopeDayIds?: number[];
  detail?: DecisionProblemDetail | DecisionProblemSummary;
  linkedIssue?: FeasibilityIssueDto;
  ruleId?: string;
  issueKind?: string;
}): Pick<
  InternalUnifiedProblemRow,
  'queueTitle' | 'queueDescription' | 'planningCategory' | 'affectedDayNumbers' | 'affectedScopeSummary'
> {
  const planningCategory = resolvePlanningCategory({
    issue: input.linkedIssue,
    dimension: input.dimension,
    detail: input.detail && 'assertions' in input.detail ? input.detail : undefined,
  });
  const queueDescription = resolveQueueDescription({
    issue: input.linkedIssue,
    detail: input.detail && 'assertions' in input.detail ? input.detail : undefined,
    rawSummary: input.rawSummary,
    rawTitle: input.rawTitle,
  });
  const queueTitle = resolveShortQueueTitle({
    semanticKey: input.semanticKey,
    issueKind: input.issueKind ?? input.linkedIssue?.issueKind,
    ruleId: input.ruleId,
    dimension: input.dimension,
    rawTitle: input.rawTitle,
    rawSummary: queueDescription,
  });
  const affectedDayNumbers = resolveAffectedDayNumbers({
    issue: input.linkedIssue,
    scopeDayIds: input.scopeDayIds,
    detail: input.detail,
    diagnosticMessage: queueDescription,
    semanticKey: input.semanticKey,
    ruleId: input.ruleId ?? input.linkedIssue?.issueKind,
  });
  const affectedScopeSummary = resolveAffectedScopeSummary({
    issue: input.linkedIssue,
    diagnosticMessage: queueDescription,
  });

  return {
    queueTitle,
    queueDescription,
    planningCategory,
    affectedDayNumbers,
    affectedScopeSummary,
  };
}

function buildLegacySummaryFromRow(row: InternalUnifiedProblemRow): UnifiedDecisionProblemLegacySummary {
  const planningCategory =
    row.planningCategory ?? resolvePlanningCategory({ dimension: row.dimension, issue: row.linkedIssue });
  const diagnosticMessage = row.queueDescription ?? row.summary;
  const affectedDayNumbers =
    row.affectedDayNumbers ??
    resolveAffectedDayNumbers({
      issue: row.linkedIssue,
      scopeDayIds: row.scope.dayIds,
      detail: row.rawLegacy,
      diagnosticMessage,
      semanticKey: row.semanticKey,
      ruleId: row.linkedIssue?.proofs?.[0]?.ruleId ?? row.linkedIssue?.issueKind,
    });
  const affectedScopeSummary =
    row.affectedScopeSummary ??
    resolveAffectedScopeSummary({
      issue: row.linkedIssue,
      diagnosticMessage,
    });
  const description = diagnosticMessage;

  return {
    affectedDayNumbers,
    affectedScopeSummary,
    categoryLabel: categoryLabelFor(planningCategory),
    description,
  };
}

function buildImpactScopeView(
  row: InternalUnifiedProblemRow,
): UnifiedDecisionProblemListItem['impactScopeView'] {
  const legacy = buildLegacySummaryFromRow(row);
  const days =
    legacy.affectedDayNumbers.length > 0
      ? legacy.affectedDayNumbers
      : resolveAffectedDayNumbers({
          issue: row.linkedIssue,
          scopeDayIds: row.scope.dayIds,
          detail: row.rawLegacy,
          diagnosticMessage: legacy.description,
          semanticKey: row.semanticKey,
        });
  if (!days.length) return undefined;
  const label = legacy.affectedScopeSummary || row.queueTitle || row.title;
  const tripDays = days.filter((dayIndex) => dayIndex > 0 && dayIndex <= 60);
  if (!tripDays.length) return undefined;
  const arrangements = tripDays.map((dayIndex) => ({ label, dayIndex }));
  return {
    arrangements: dedupeImpactScopeArrangements(arrangements),
  };
}

function dedupeImpactScopeArrangements(
  arrangements: Array<{ label: string; dayIndex: number }>,
): Array<{ label: string; dayIndex: number }> {
  const seen = new Set<string>();
  return arrangements.filter((entry) => {
    const key = `${entry.dayIndex}:${entry.label}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mergeAffectedDayNumbers(a?: number[], b?: number[]): number[] | undefined {
  const merged = new Set<number>([...(a ?? []), ...(b ?? [])]);
  const sorted = [...merged].sort((x, y) => x - y);
  return sorted.length ? sorted : undefined;
}

function buildActionability(
  enforcement: ConstraintEnforcement,
  row: InternalUnifiedProblemRow,
): UnifiedDecisionProblemActionability {
  const allowedActions = [...ENFORCEMENT_ALLOWED_ACTIONS[enforcement]];
  const requiresAction =
    qualifiesForDecisionQueue({
      enforcement,
      workflowStatus: row.workflowStatus,
      semanticKey: row.semanticKey,
      title: row.title,
      summary: row.summary,
      hasExecutableOptions: row.hasExecutableOptions,
      blocksPlan: enforcement === 'BLOCK',
      requiresAdjustment: enforcement === 'REQUIRE_ADJUSTMENT',
      requiresConfirmation: enforcement === 'REQUIRE_CONFIRMATION',
    }) && allowedActions.length > 0;

  const isDecisionCase =
    row.problemId.startsWith('dc_') ||
    row.origin?.engineId === 'DECISION_CASE_PUBLISHER';

  return {
    requiresAction,
    allowedActions,
    recommendedAction: allowedActions[0],
    ...(isDecisionCase ? { writeChain: 'CONSTRAINT_WRITEBACK' as const } : {}),
  };
}

function buildDebugMeta(row: InternalUnifiedProblemRow): UnifiedDecisionProblemDebugMeta {
  return {
    authority: row.authority,
    engineId: row.route?.engineId ?? (row.authority === 'CANONICAL' ? 'CANONICAL_DECISION_RUNTIME' : 'LEGACY_V15_ADAPTER'),
    resolution: row.route?.resolution ?? (row.authority === 'CANONICAL' ? 'PRIMARY' : 'LEGACY_FALLBACK'),
    sourceIds: row.sourceIds,
    flow: row.flow,
    route: row.route,
  };
}

function scopeFromLegacyDetail(detail: DecisionProblemDetail, tripId: string): DecisionProblemScope {
  const dayIds = detail.affectedScope
    .filter((s) => s.scopeType === 'DAY')
    .map((s) => Number(s.scopeId))
    .filter((n) => Number.isFinite(n));
  const itemIds = detail.affectedScope
    .filter((s) => s.scopeType === 'ITINERARY_ITEM')
    .map((s) => s.scopeId);
  const routeSegmentIds = detail.affectedScope
    .filter((s) => s.scopeType === 'ROUTE_SEGMENT')
    .map((s) => s.scopeId);
  const memberIds = detail.affectedScope
    .filter((s) => s.scopeType === 'MEMBER')
    .map((s) => s.scopeId);

  return {
    tripId,
    dayIds: dayIds.length ? dayIds : undefined,
    itemIds: itemIds.length ? itemIds : undefined,
    routeSegmentIds: routeSegmentIds.length ? routeSegmentIds : undefined,
    memberIds: memberIds.length ? memberIds : undefined,
  };
}

function dimensionFromLegacyDetail(detail: DecisionProblemDetail): DecisionDimension {
  const domain = detail.assertions[0]?.domain;
  if (domain === 'TIME' || domain === 'ENERGY') return 'SCHEDULE';
  if (domain === 'ROUTE') return 'TRANSPORT';
  if (domain === 'ACCESS' || domain === 'BOOKING') return 'BOOKING';
  if (domain === 'WEATHER') return 'ENVIRONMENT';
  if (domain === 'TEAM_FIT') return 'TEAM_FIT';
  if (domain === 'BUDGET') return 'BUDGET';
  return 'OTHER';
}

function occurrencesFromScope(
  scope: DecisionProblemScope,
  occurrenceId: string,
): DecisionProblemOccurrence[] {
  return [
    {
      occurrenceId,
      dayId: scope.dayIds?.[0],
      itemIds: scope.itemIds,
      routeSegmentId: scope.routeSegmentIds?.[0],
    },
  ];
}

export function mapStoredResolutionExecutionStatus(
  stored?: import('../persistence/decision-problem-resolution.store').StoredDecisionProblemResolution,
): DecisionProblemExecutionStatus {
  if (!stored) return 'NOT_STARTED';
  switch (stored.status) {
    case 'AUTHORIZED':
      return stored.actionPlanId ? 'DRAFT_CREATED' : 'NOT_STARTED';
    case 'APPLYING':
      return 'APPLYING';
    case 'APPLIED':
      return 'APPLIED';
    case 'VERIFIED':
      return 'VERIFIED';
    case 'FAILED':
      return 'FAILED';
    case 'ROLLED_BACK':
      return 'ROLLED_BACK';
    default:
      return 'NOT_STARTED';
  }
}

export function overlayStoredResolutionOnListItem(
  item: UnifiedDecisionProblemListItem,
  stored?: import('../persistence/decision-problem-resolution.store').StoredDecisionProblemResolution,
): UnifiedDecisionProblemListItem {
  if (!stored) return item;

  if (stored.status === 'VERIFIED') {
    return {
      ...item,
      workflowStatus: 'RESOLVED',
      executionStatus: 'VERIFIED',
      actionability: { ...item.actionability, requiresAction: false, allowedActions: [] },
    };
  }

  const executionStatus = mapStoredResolutionExecutionStatus(stored);
  const workflowStatus: DecisionProblemWorkflowStatus =
    stored.status === 'APPLIED' ? 'DECIDED' : 'DECIDED';

  return {
    ...item,
    workflowStatus,
    executionStatus,
    actionability:
      stored.status === 'AUTHORIZED' || stored.status === 'APPLYING' || stored.status === 'APPLIED'
        ? { ...item.actionability, requiresAction: false }
        : item.actionability,
  };
}

function mapWorkflowToExecutionStatus(
  status: DecisionProblemWorkflowStatus,
): DecisionProblemExecutionStatus {
  switch (status) {
    case 'DECIDED':
      return 'DRAFT_CREATED';
    case 'RESOLVED':
      return 'VERIFIED';
    case 'DISMISSED':
      return 'NOT_REQUIRED';
    default:
      return 'NOT_STARTED';
  }
}
