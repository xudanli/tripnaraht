import type { PlanState } from '../../skills/plan/shared/plan-state.types';
import type { RouteSegment } from '../../trips/decision/shared/world-model.types';
import type {
  PlanGateMetricsDeltaDto,
} from '../dto/plan-gate.dto';
import { estimateDraftExecutability } from './plan-gate-feasibility.projection.util';
import type { PlanGateMemberSplitChange } from './plan-gate-member-diff.projection.util';
import { projectPlanGateMapGeoJson } from './plan-gate-map.projection.util';
import type {
  PlanGatePreTripTasksSummary,
} from './plan-gate-pretrip-tasks.util';
import { summarizeTimelineWrite } from './plan-gate-timeline-materializer.util';

export type PlanGateTimelineChangeKind =
  | 'added'
  | 'removed'
  | 'replaced'
  | 'time_adjusted'
  | 'reordered'
  | 'accommodation_changed'
  | 'member_participation_changed';

export interface PlanGateTimelineChange {
  kind: PlanGateTimelineChangeKind;
  day?: number;
  segmentId?: string;
  label: string;
  before?: string;
  after?: string;
  impact: 'low' | 'medium' | 'high';
}

export interface PlanGateMapSegmentChange {
  day?: number;
  segmentId?: string;
  label: string;
  changeType: 'new' | 'removed' | 'modified' | 'unchanged';
  distanceKmDelta?: number;
}

export interface PlanGateRiskChange {
  kind: 'resolved' | 'new' | 'retained' | 'pending';
  label: string;
  day?: number;
}

export interface PlanGateDraftDiff {
  baselinePlanId: string;
  baselineLabel: string;
  draftPlanId: string;
  draftLabel: string;
  timelineChanges: PlanGateTimelineChange[];
  metrics: PlanGateMetricsDeltaDto;
  mapChanges: PlanGateMapSegmentChange[];
  riskChanges: PlanGateRiskChange[];
  memberChanges?: PlanGateMemberSplitChange[];
  changeLog: string[];
  affectedDayCount: number;
  mapGeoJson?: ReturnType<typeof projectPlanGateMapGeoJson>;
}

export interface PlanGateDiffProjectionOptions {
  baselineExecutability?: number;
  draftExecutability?: number;
  memberChanges?: PlanGateMemberSplitChange[];
}

export interface PlanGateCommitResult {
  success: boolean;
  committedPlanId: string;
  committedVersionLabel: string;
  committedAt: string;
  headline: string;
  updates: string[];
  metrics?: PlanGateMetricsDeltaDto;
  preTripTasksCount?: number;
  preTripTasks?: PlanGatePreTripTasksSummary;
  nextActions: Array<{ label: string; action?: string }>;
}

function draftLabel(planState: PlanState, planId: string): string {
  return (planState.metadata?.draftLabel as string | undefined) ?? `A${planState.plan_version ?? 1}`;
}

function segmentDayKey(segment: RouteSegment): string {
  const day = segment.metadata?.day as number | undefined;
  return day != null ? `day_${day}` : segment.segmentId;
}

function segmentSummary(segment: RouteSegment): string {
  const meta = segment.metadata ?? {};
  const name = meta.name as string | undefined;
  const theme = meta.theme as string | undefined;
  const day = meta.day as number | undefined;
  if (name) return name;
  if (theme && day) return `第${day}天：${theme}`;
  if (theme) return theme;
  return segment.segmentId;
}

function accommodationLabel(segment: RouteSegment): string | undefined {
  const acc = segment.metadata?.accommodation as { nameCN?: string; nameEN?: string; name?: string } | undefined;
  if (!acc) return undefined;
  return acc.nameCN ?? acc.nameEN ?? acc.name;
}

function estimateBudget(planState: PlanState): number {
  return (
    planState.budget?.breakdown?.categories?.reduce((sum, c) => sum + (c.estimated ?? 0), 0) ?? 0
  );
}

function estimateDrivingMinutes(planState: PlanState): number {
  return (
    planState.itinerary?.segments?.reduce(
      (sum, s) =>
        sum +
        ((s.metadata?.drivingMinutes as number | undefined) ??
          (s.distanceKm > 0 ? Math.round((s.distanceKm / 60) * 60) : 0)),
      0,
    ) ?? 0
  );
}

function executabilityScore(planState: PlanState): number | undefined {
  const stored = planState.metadata?.executabilityScore as number | undefined;
  if (stored != null) return stored;
  return estimateDraftExecutability(planState);
}

function collectGateReasons(planState: PlanState): string[] {
  return [
    ...(planState.gate?.reasons ?? []),
    ...(planState.gate?.requiredUserConfirmations ?? []),
  ].map(String);
}

function compareTimeline(
  baselineSegments: RouteSegment[],
  draftSegments: RouteSegment[],
): PlanGateTimelineChange[] {
  const changes: PlanGateTimelineChange[] = [];
  const baselineByDay = new Map<string, RouteSegment>();
  const draftByDay = new Map<string, RouteSegment>();

  for (const seg of baselineSegments) baselineByDay.set(segmentDayKey(seg), seg);
  for (const seg of draftSegments) draftByDay.set(segmentDayKey(seg), seg);

  const allKeys = new Set([...baselineByDay.keys(), ...draftByDay.keys()]);

  for (const key of allKeys) {
    const before = baselineByDay.get(key);
    const after = draftByDay.get(key);
    const day = (after?.metadata?.day ?? before?.metadata?.day) as number | undefined;

    if (!before && after) {
      changes.push({
        kind: 'added',
        day,
        segmentId: after.segmentId,
        label: `新增 ${segmentSummary(after)}`,
        after: segmentSummary(after),
        impact: 'medium',
      });
      continue;
    }

    if (before && !after) {
      changes.push({
        kind: 'removed',
        day,
        segmentId: before.segmentId,
        label: `删除 ${segmentSummary(before)}`,
        before: segmentSummary(before),
        impact: 'high',
      });
      continue;
    }

    if (!before || !after) continue;

    const beforeSummary = segmentSummary(before);
    const afterSummary = segmentSummary(after);

    if (beforeSummary !== afterSummary || before.segmentId !== after.segmentId) {
      changes.push({
        kind: 'replaced',
        day,
        segmentId: after.segmentId,
        label: `第${day ?? after.dayIndex + 1}天行程调整`,
        before: beforeSummary,
        after: afterSummary,
        impact: 'medium',
      });
    }

    const beforeAcc = accommodationLabel(before);
    const afterAcc = accommodationLabel(after);
    if (beforeAcc !== afterAcc && (beforeAcc || afterAcc)) {
      changes.push({
        kind: 'accommodation_changed',
        day,
        segmentId: after.segmentId,
        label: `第${day ?? after.dayIndex + 1}天住宿变更`,
        before: beforeAcc,
        after: afterAcc,
        impact: 'high',
      });
    }

    if (before.dayIndex !== after.dayIndex) {
      changes.push({
        kind: 'reordered',
        day,
        segmentId: after.segmentId,
        label: `第${day ?? after.dayIndex + 1}天顺序调整`,
        before: beforeSummary,
        after: afterSummary,
        impact: 'low',
      });
    }

    if (
      before.distanceKm !== after.distanceKm &&
      Math.abs(before.distanceKm - after.distanceKm) >= 5
    ) {
      changes.push({
        kind: 'time_adjusted',
        day,
        segmentId: after.segmentId,
        label: `第${day ?? after.dayIndex + 1}天驾驶距离变化 ${Math.round(before.distanceKm - after.distanceKm)}km`,
        before: `${Math.round(before.distanceKm)}km`,
        after: `${Math.round(after.distanceKm)}km`,
        impact: Math.abs(before.distanceKm - after.distanceKm) > 50 ? 'high' : 'medium',
      });
    }
  }

  return changes;
}

function compareMapChanges(
  baselineSegments: RouteSegment[],
  draftSegments: RouteSegment[],
): PlanGateMapSegmentChange[] {
  const draftByDay = new Map(draftSegments.map((s) => [segmentDayKey(s), s]));
  const result: PlanGateMapSegmentChange[] = [];

  for (const base of baselineSegments) {
    const key = segmentDayKey(base);
    const draft = draftByDay.get(key);
    const day = base.metadata?.day as number | undefined;
    if (!draft) {
      result.push({
        day,
        segmentId: base.segmentId,
        label: segmentSummary(base),
        changeType: 'removed',
        distanceKmDelta: -base.distanceKm,
      });
      continue;
    }
    const delta = draft.distanceKm - base.distanceKm;
    result.push({
      day,
      segmentId: draft.segmentId,
      label: segmentSummary(draft),
      changeType: Math.abs(delta) >= 1 || segmentSummary(base) !== segmentSummary(draft) ? 'modified' : 'unchanged',
      distanceKmDelta: Math.abs(delta) >= 0.1 ? delta : undefined,
    });
    draftByDay.delete(key);
  }

  for (const draft of draftByDay.values()) {
    result.push({
      day: draft.metadata?.day as number | undefined,
      segmentId: draft.segmentId,
      label: segmentSummary(draft),
      changeType: 'new',
      distanceKmDelta: draft.distanceKm,
    });
  }

  return result;
}

function compareRiskChanges(baseline: PlanState, draft: PlanState): PlanGateRiskChange[] {
  const baseReasons = new Set(collectGateReasons(baseline));
  const draftReasons = collectGateReasons(draft);
  const changes: PlanGateRiskChange[] = [];

  for (const reason of draftReasons) {
    if (!baseReasons.has(reason)) {
      changes.push({ kind: 'new', label: reason });
    } else {
      changes.push({ kind: 'retained', label: reason });
    }
  }

  for (const reason of baseReasons) {
    if (!draftReasons.includes(reason)) {
      changes.push({ kind: 'resolved', label: reason });
    }
  }

  if (draft.gate?.status === 'NEED_CONFIRM') {
    for (const c of draft.gate.requiredUserConfirmations ?? []) {
      if (!changes.some((x) => x.label === c)) {
        changes.push({ kind: 'pending', label: String(c) });
      }
    }
  }

  return changes;
}

function buildChangeLog(
  timelineChanges: PlanGateTimelineChange[],
  memberChanges?: PlanGateMemberSplitChange[],
): string[] {
  const memberLines = (memberChanges ?? [])
    .filter((c) => c.impact !== 'low')
    .slice(0, 4)
    .map((c) => {
      if (c.before && c.after) return `${c.label}：${c.before} → ${c.after}`;
      return c.label;
    });

  const timelineLines = timelineChanges.slice(0, 12).map((c) => {
    if (c.before && c.after) return `${c.label}：${c.before} → ${c.after}`;
    return c.label;
  });

  return [...memberLines, ...timelineLines].slice(0, 12);
}

function buildMetricsDelta(
  baseline: PlanState,
  draft: PlanState,
  options?: PlanGateDiffProjectionOptions,
): PlanGateMetricsDeltaDto {
  const currency = draft.constraints.budget?.currency ?? 'CNY';
  const baseBudget = estimateBudget(baseline);
  const draftBudget = estimateBudget(draft);
  const baseDrive = estimateDrivingMinutes(baseline);
  const draftDrive = estimateDrivingMinutes(draft);
  const baseExec = options?.baselineExecutability ?? executabilityScore(baseline);
  const draftExec = options?.draftExecutability ?? executabilityScore(draft);

  const affectedDays = new Set(
    compareTimeline(baseline.itinerary?.segments ?? [], draft.itinerary?.segments ?? [])
      .map((c) => c.day)
      .filter((d): d is number => d != null),
  );
  for (const change of options?.memberChanges ?? []) {
    affectedDays.add(change.day);
  }

  const affectedMembers =
    (draft.metadata?.affectedMembers as number | undefined) ??
    (options?.memberChanges?.length
      ? new Set(
          options.memberChanges.flatMap((c) => [c.day]),
        ).size
      : undefined);

  return {
    executability:
      baseExec != null || draftExec != null ? { from: baseExec, to: draftExec } : undefined,
    budgetPerPerson:
      draftBudget > 0
        ? {
            from: baseBudget || undefined,
            to: draftBudget,
            delta: baseBudget ? draftBudget - baseBudget : undefined,
            currency,
          }
        : undefined,
    totalDrivingMinutes:
      draftDrive > 0 || baseDrive > 0
        ? {
            from: baseDrive || undefined,
            to: draftDrive,
            delta: baseDrive ? draftDrive - baseDrive : undefined,
          }
        : undefined,
    affectedDays: affectedDays.size || undefined,
    affectedMembers,
  };
}

export function projectPlanGateDraftDiff(input: {
  baselinePlanId: string;
  baselinePlanState: PlanState;
  draftPlanId: string;
  draftPlanState: PlanState;
  options?: PlanGateDiffProjectionOptions;
}): PlanGateDraftDiff {
  const baselineSegments = input.baselinePlanState.itinerary?.segments ?? [];
  const draftSegments = input.draftPlanState.itinerary?.segments ?? [];
  const mapChanges = compareMapChanges(baselineSegments, draftSegments);
  const timelineChanges = compareTimeline(baselineSegments, draftSegments);
  const affectedDayCount = new Set(
    timelineChanges.map((c) => c.day).filter((d): d is number => d != null),
  ).size;

  const mapGeoJson = projectPlanGateMapGeoJson({
    baselinePlanState: input.baselinePlanState,
    draftPlanState: input.draftPlanState,
    mapChanges,
  });

  const memberChanges = input.options?.memberChanges;

  return {
    baselinePlanId: input.baselinePlanId,
    baselineLabel: draftLabel(input.baselinePlanState, input.baselinePlanId),
    draftPlanId: input.draftPlanId,
    draftLabel: draftLabel(input.draftPlanState, input.draftPlanId),
    timelineChanges,
    metrics: buildMetricsDelta(input.baselinePlanState, input.draftPlanState, input.options),
    mapChanges,
    mapGeoJson,
    riskChanges: compareRiskChanges(input.baselinePlanState, input.draftPlanState),
    memberChanges,
    changeLog: buildChangeLog(timelineChanges, memberChanges),
    affectedDayCount: Math.max(
      affectedDayCount,
      new Set((memberChanges ?? []).map((c) => c.day)).size,
    ),
  };
}

export function buildPlanGateCommitResult(input: {
  planState: PlanState;
  baselinePlanState?: PlanState;
  diff?: PlanGateDraftDiff;
  preTripTasks?: PlanGatePreTripTasksSummary;
}): PlanGateCommitResult {
  const { planState, baselinePlanState, diff, preTripTasks } = input;
  const committedAt =
    (planState.metadata?.committedAt as string | undefined) ?? new Date().toISOString();
  const versionLabel = draftLabel(planState, planState.plan_id);

  const updates = diff?.changeLog?.length
    ? diff.changeLog.slice(0, 6)
    : buildFallbackCommitUpdates(planState, baselinePlanState);

  const metrics =
    diff?.metrics ??
    (baselinePlanState
      ? buildMetricsDelta(baselinePlanState, planState)
      : undefined);

  const preTripTasksCount =
    preTripTasks?.total ??
    (planState.metadata?.preTripTasksCount as number | undefined) ??
    estimatePreTripTasks(planState);

  const timelineWrite = planState.metadata?.planGateTimelineWrite as
    | { added?: number; materializedDays?: number[] }
    | undefined;
  const timelineUpdates = timelineWrite
    ? summarizeTimelineWrite({
        added: timelineWrite.added ?? 0,
        modified: 0,
        removed: 0,
        materializedDays: timelineWrite.materializedDays ?? [],
        skippedDays: [],
      })
    : [];

  const mergedUpdates = [...timelineUpdates, ...updates].slice(0, 8);

  return {
    success: true,
    committedPlanId: planState.plan_id,
    committedVersionLabel: versionLabel,
    committedAt,
    headline: `方案 ${versionLabel} 已写入时间轴`,
    updates: mergedUpdates.length ? mergedUpdates : updates,
    metrics,
    preTripTasksCount,
    preTripTasks,
    nextActions: [
      { label: '查看更新时间轴', action: 'view_timeline' },
      { label: '查看可执行性证明', action: 'view_feasibility_proof' },
      ...(preTripTasksCount > 0
        ? [{ label: `查看行前任务（${preTripTasksCount}）`, action: 'view_pretrip_tasks' }]
        : []),
    ],
  };
}

function buildFallbackCommitUpdates(
  planState: PlanState,
  baseline?: PlanState,
): string[] {
  const updates: string[] = [];
  const segments = planState.itinerary?.segments ?? [];

  if (baseline && segments.length) {
    const diff = projectPlanGateDraftDiff({
      baselinePlanId: baseline.plan_id,
      baselinePlanState: baseline,
      draftPlanId: planState.plan_id,
      draftPlanState: planState,
    });
    if (diff.changeLog.length) return diff.changeLog.slice(0, 6);
  }

  if (planState.metadata?.selectedSkeletonName) {
    updates.push(`采用方案：${planState.metadata.selectedSkeletonName}`);
  }

  const currency = planState.constraints.budget?.currency ?? 'CNY';
  const budget = estimateBudget(planState);
  if (budget > 0) {
    updates.push(`预算预估 ${budget} ${currency}`);
  }

  if (segments.length) {
    updates.push(`更新 ${segments.length} 天行程结构`);
  }

  return updates.length ? updates : ['行程时间轴已更新'];
}

function estimatePreTripTasks(planState: PlanState): number {
  const explicit = planState.metadata?.preTripTasksCount as number | undefined;
  if (explicit != null) return explicit;

  let count = 0;
  if ((planState.gate?.missingEvidence?.length ?? 0) > 0) count += 1;
  if (planState.budget.overrun?.overrunAmount) count += 1;
  if (planState.gate?.status === 'NEED_CONFIRM') count += 1;
  return Math.min(Math.max(count, 1), 5);
}

export function resolveBaselinePlanId(
  draftPlanState: PlanState,
  tripMetadata?: Record<string, unknown>,
): string | undefined {
  const fromDraft = draftPlanState.metadata?.baselinePlanId as string | undefined;
  if (fromDraft && fromDraft !== draftPlanState.plan_id) return fromDraft;

  const current = tripMetadata?.currentPlanId as string | undefined;
  if (current && current !== draftPlanState.plan_id) return current;

  const lastCommitted = tripMetadata?.lastCommittedPlanId as string | undefined;
  if (lastCommitted && lastCommitted !== draftPlanState.plan_id) return lastCommitted;

  return undefined;
}
