/**
 * Constraint Console + Assessment 合并投影（纯函数，无 Nest / React）
 */

import type { TripConstraint } from './frontend-travel-decision-contract-api.types';
import type {
  ConstraintAggregateStatusUi,
  ConstraintAssessmentLaneBadge,
  ConstraintCardView,
  ConstraintConsoleWithAssessmentsViewModel,
  ConstraintEvaluationStatus,
  UnifiedAssessmentAggregateStatus,
  UnifiedConstraintAssessmentBundle,
  UnifiedConstraintAssessmentLane,
  UnifiedConstraintAssessmentView,
} from './frontend-constraint-assessment-api.types';
import type { ConstraintConsoleViewModel } from './frontend-travel-decision-contract-api.types';
import { highlightConflictConstraintIds, isReadonlyConstraint } from './frontend-travel-decision-contract-view.util';

const TEMPLATE_ID_TO_CONSTRAINT_KEY: Record<string, string> = {
  max_daily_drive: 'MAX_DAILY_DRIVE',
  no_night_drive: 'NO_NIGHT_DRIVE',
  f_road_vehicle_access: 'OFFICIAL_IS_FROAD_2WD',
  no_unpaved_road: 'NO_UNPAVED_ROAD',
  fixed_appointments: 'FIXED_APPOINTMENTS',
};

const LEGACY_ID_TO_CONSTRAINT_KEY: Record<string, string> = {
  c_max_daily_drive: 'MAX_DAILY_DRIVE',
  c_no_night_drive: 'NO_NIGHT_DRIVE',
  c_official_is_froad_2wd: 'OFFICIAL_IS_FROAD_2WD',
  c_tpl_no_unpaved_road: 'NO_UNPAVED_ROAD',
  c_tpl_fixed_appointments: 'FIXED_APPOINTMENTS',
};

const LANE_STATUS_LABELS: Record<ConstraintEvaluationStatus, string> = {
  PASS: '已满足',
  BLOCK: '不可执行',
  WARNING: '需关注',
  UNKNOWN: '待验证',
  REQUIRES_VERIFICATION: '待确认',
};

const AGGREGATE_STATUS_UI: Record<
  UnifiedAssessmentAggregateStatus,
  Omit<ConstraintAggregateStatusUi, 'aggregateStatus'>
> = {
  PASS: { label: '满足', tone: 'success', accent: 'pass', isBlocking: false },
  WARN: { label: '需要关注', tone: 'warning', accent: 'warn', isBlocking: false },
  PLANNING_BLOCK: { label: '规划不可行', tone: 'danger', accent: 'block', isBlocking: true },
  EXECUTION_BLOCK: { label: '不可执行', tone: 'danger', accent: 'block', isBlocking: true },
  RUNTIME_BLOCK: { label: '当前受阻', tone: 'danger', accent: 'block', isBlocking: true },
  UNKNOWN: { label: '待验证', tone: 'neutral', accent: 'unknown', isBlocking: false },
};

export function resolveConstraintKeyForTripConstraint(
  constraint: Pick<TripConstraint, 'id' | 'source'> & {
    capability?: { constraintKey?: string };
  },
): string | undefined {
  const fromCapability = constraint.capability?.constraintKey?.trim();
  if (fromCapability) return fromCapability;

  const templateId = constraint.source.templateId?.trim();
  if (templateId && TEMPLATE_ID_TO_CONSTRAINT_KEY[templateId]) {
    return TEMPLATE_ID_TO_CONSTRAINT_KEY[templateId];
  }

  return LEGACY_ID_TO_CONSTRAINT_KEY[constraint.id];
}

export function buildAssessmentLookup(bundle: UnifiedConstraintAssessmentBundle): {
  byConstraintKey: Map<string, UnifiedConstraintAssessmentView>;
  byLegacyId: Map<string, UnifiedConstraintAssessmentView>;
} {
  const byConstraintKey = new Map<string, UnifiedConstraintAssessmentView>();
  const byLegacyId = new Map<string, UnifiedConstraintAssessmentView>();

  for (const item of bundle.items) {
    byConstraintKey.set(item.constraintKey, item);
    if (item.legacyConstraintId) {
      byLegacyId.set(item.legacyConstraintId, item);
    }
  }

  return { byConstraintKey, byLegacyId };
}

export function resolveAggregateStatusUi(
  aggregateStatus: UnifiedAssessmentAggregateStatus,
): ConstraintAggregateStatusUi {
  const ui = AGGREGATE_STATUS_UI[aggregateStatus] ?? AGGREGATE_STATUS_UI.UNKNOWN;
  return { aggregateStatus, ...ui };
}

export function resolveAssessmentForConstraint(
  constraint: TripConstraint,
  lookup: ReturnType<typeof buildAssessmentLookup>,
): UnifiedConstraintAssessmentView | null {
  const byId = lookup.byLegacyId.get(constraint.id);
  if (byId) return byId;

  const key = resolveConstraintKeyForTripConstraint(constraint);
  if (!key) return null;
  return lookup.byConstraintKey.get(key) ?? null;
}

function formatEvidenceSummary(lane: UnifiedConstraintAssessmentLane): string | undefined {
  const evidence = lane.evidence;
  if (!evidence) return lane.message;

  const parts: string[] = [];
  if (evidence.day != null) parts.push(`Day${evidence.day}`);
  if (evidence.actual) parts.push(evidence.actual);
  else if (evidence.measuredMinutes != null) parts.push(`${evidence.measuredMinutes}min`);
  if (lane.ruleId) parts.push(lane.ruleId);

  return parts.length ? parts.join(' · ') : lane.message;
}

export function buildLaneBadges(
  assessment: UnifiedConstraintAssessmentView | null,
): ConstraintAssessmentLaneBadge[] {
  if (!assessment) return [];

  const badges: ConstraintAssessmentLaneBadge[] = [];

  const pushLane = (
    kind: 'planning' | 'executability' | 'runtime',
    label: string,
    lane: UnifiedConstraintAssessmentLane | null,
  ) => {
    if (!lane) return;
    badges.push({
      kind,
      label,
      status: lane.status,
      statusLabel: LANE_STATUS_LABELS[lane.status] ?? lane.status,
      source: lane.source,
      ruleId: lane.ruleId,
      message: lane.message,
      evidenceSummary: formatEvidenceSummary(lane),
      problemIds: lane.problemIds,
    });
  };

  pushLane('planning', '规划', assessment.lanes.planning);
  pushLane('executability', '执行', assessment.lanes.executability);
  pushLane('runtime', '当前', assessment.lanes.runtime);

  return badges;
}

export function buildRepairDeepLink(
  tripId: string,
  input: { problemIds?: string[]; constraintId: string; aggregateStatus: UnifiedAssessmentAggregateStatus },
): string | undefined {
  if (!input.problemIds?.length && !AGGREGATE_STATUS_UI[input.aggregateStatus]?.isBlocking) {
    return undefined;
  }

  const params = new URLSearchParams();
  params.set('constraintId', input.constraintId);
  if (input.problemIds?.[0]) params.set('problemId', input.problemIds[0]);
  return `/trips/${tripId}/repair?${params.toString()}`;
}

export function buildConstraintCardView(input: {
  constraint: TripConstraint;
  assessment: UnifiedConstraintAssessmentView | null;
  readonly?: boolean;
  highlighted?: boolean;
  tripId: string;
}): ConstraintCardView {
  const { constraint, assessment } = input;
  const aggregateStatus = assessment?.aggregateStatus ?? 'PASS';
  const aggregateUi = resolveAggregateStatusUi(aggregateStatus);
  const laneBadges = buildLaneBadges(assessment);
  const problemIds = assessment?.problemIds;

  const contractRequirement =
    assessment?.contractRequirement ??
    constraint.contractMeta?.judgmentRule ??
    constraint.displayValue;

  return {
    constraintId: constraint.id,
    constraintKey: resolveConstraintKeyForTripConstraint(constraint),
    name: constraint.name,
    contractRequirement,
    readonly: input.readonly ?? isReadonlyConstraint(constraint),
    highlighted: input.highlighted ?? false,
    contractCardTone: constraint.cardTone,
    assessment,
    aggregateUi,
    laneBadges,
    problemIds,
    repairDeepLink: buildRepairDeepLink(input.tripId, {
      constraintId: constraint.id,
      problemIds,
      aggregateStatus,
    }),
  };
}

export function buildConstraintConsoleWithAssessments(input: {
  console: ConstraintConsoleViewModel;
  assessments: UnifiedConstraintAssessmentBundle;
  tripId: string;
}): ConstraintConsoleWithAssessmentsViewModel {
  const lookup = buildAssessmentLookup(input.assessments);
  const conflictIds = highlightConflictConstraintIds(input.console);
  const cardsByConstraintId: Record<string, ConstraintCardView> = {};

  const sections = input.console.sections.map(({ section, constraints, contractBlock }) => {
    const cards = constraints.map((constraint) => {
      const card = buildConstraintCardView({
        constraint,
        assessment: resolveAssessmentForConstraint(constraint, lookup),
        readonly: section.readonly,
        highlighted: conflictIds.has(constraint.id),
        tripId: input.tripId,
      });
      cardsByConstraintId[constraint.id] = card;
      return card;
    });
    return { section, contractBlock, cards };
  });

  return {
    console: input.console,
    assessments: input.assessments,
    cardsByConstraintId,
    sections,
  };
}
