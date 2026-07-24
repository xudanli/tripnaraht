import type { DecisionCheckerSplitPlanDto } from '../types/decision-checker.types';
import type { PlanningDaySplitDto } from '../types/planning-conflicts.types';
import type {
  SplitPlanOverrides,
  SplitPlanOverridesMap,
} from '../types/split-plan-overrides.types';
import type { SplitPlanProjectionResult } from './split-plan.projection.util';

export function readSplitPlanOverridesMap(metadata: unknown): SplitPlanOverridesMap {
  if (!metadata || typeof metadata !== 'object') return {};
  const raw = (metadata as { splitPlanOverrides?: unknown }).splitPlanOverrides;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  return raw as SplitPlanOverridesMap;
}

export function mergeSplitPlanProjection(
  bundle: SplitPlanProjectionResult,
  overrides?: SplitPlanOverrides,
): SplitPlanProjectionResult {
  if (!overrides) return bundle;

  const splitPlan: DecisionCheckerSplitPlanDto = {
    ...bundle.splitPlan,
    logistics: {
      ...bundle.splitPlan.logistics,
      ...overrides.logistics,
    },
  };

  if (overrides.emergencyNote?.trim()) {
    splitPlan.risks = [
      ...(splitPlan.risks ?? []),
      { title: '应急说明', description: overrides.emergencyNote.trim() },
    ];
  }

  if (overrides.groups?.length) {
    splitPlan.groups = splitPlan.groups.map((group) => {
      const patch = overrides.groups!.find((entry) => entry.id === group.id);
      if (!patch) return group;
      return {
        ...group,
        label: patch.label ?? group.label,
        activityTitle: patch.activityTitle ?? group.activityTitle,
      };
    });
  }

  const daySplit = mergeDaySplitOverrides(bundle.daySplits[0], overrides.daySplit);
  const daySplits = daySplit ? [daySplit] : bundle.daySplits;

  if (daySplit && overrides.daySplit?.stats?.meetupTime) {
    splitPlan.logistics.meetupTime = overrides.daySplit.stats.meetupTime;
  }
  if (daySplit?.rejoin?.placeName && overrides.daySplit?.rejoin?.placeName) {
    splitPlan.logistics.meetupPoint = overrides.daySplit.rejoin.placeName;
  }

  return { splitPlan, daySplits };
}

function mergeDaySplitOverrides(
  daySplit: PlanningDaySplitDto | undefined,
  patch?: SplitPlanOverrides['daySplit'],
): PlanningDaySplitDto | undefined {
  if (!daySplit || !patch) return daySplit;

  const rejoin = daySplit.rejoin
    ? {
        ...daySplit.rejoin,
        ...(patch.rejoin ?? {}),
        title: patch.rejoin?.title ?? daySplit.rejoin.title,
        placeName: patch.rejoin?.placeName ?? daySplit.rejoin.placeName,
        startTime: patch.rejoin?.startTime ?? daySplit.rejoin.startTime,
      }
    : daySplit.rejoin;

  return {
    ...daySplit,
    title: patch.title ?? daySplit.title,
    stats: {
      ...daySplit.stats,
      ...patch.stats,
    },
    rejoin,
  };
}

export function patchSplitPlanOverrides(
  existing: SplitPlanOverrides | undefined,
  patch: SplitPlanOverrides,
  userId: string,
): SplitPlanOverrides {
  return {
    logistics: { ...existing?.logistics, ...patch.logistics },
    groups: patch.groups ?? existing?.groups,
    daySplit: {
      ...existing?.daySplit,
      ...patch.daySplit,
      stats: { ...existing?.daySplit?.stats, ...patch.daySplit?.stats },
      rejoin: { ...existing?.daySplit?.rejoin, ...patch.daySplit?.rejoin },
    },
    emergencyNote: patch.emergencyNote ?? existing?.emergencyNote,
    updatedAt: new Date().toISOString(),
    updatedBy: userId,
  };
}
