/**
 * WP-TEP-12 — DailyDrivePlan → RecoveryGraph + Local Repair 预览
 * @see internal-docs/product/TEP-SELF-DRIVE-PHASE0-ENGINEERING-CONTRACT.md §1.4 / Slice 3
 */

import type {
  DailyDrivePlan,
  DriveLoadTier,
  ExecutabilityAssessment,
  PlanDependency,
  PlannedActivity,
  PlanningRuleResult,
  RecoveryGraph,
  RecoveryOption,
  SelfDriveProfile,
} from '../contracts/tep-self-drive.types';
import { RECOVERY_GRAPH_SCHEMA } from '../contracts/tep-self-drive.types';
import {
  classifyDriveLoadTier,
  loadDrivingLoadConfig,
} from '../loaders/driving-load-config.loader';
import { validateTepPlanningSnapshot } from '../validation/tep-validator';
import { buildPlanDependencies } from '../utils/plan-dependency.builder';
import { buildSdr303DependencyImpacts } from '../validation/sdr-303-dependency.evaluator';

export interface RecoveryGraphProjectorInput {
  tripId: string;
  countryCode: string;
  dailyDrivePlans: DailyDrivePlan[];
  profile: SelfDriveProfile;
  /** 用于生成针对性 fallback（如 SDR-101 高负荷修复） */
  ruleResults?: PlanningRuleResult[];
}

export interface LocalRepairPreview {
  optionId: string;
  action: RecoveryOption['action'];
  targetRefs: string[];
  minutesReleased: number;
  loadTierBefore: DriveLoadTier;
  loadTierAfter: DriveLoadTier;
  statusBefore: ExecutabilityAssessment['status'];
  statusAfter: ExecutabilityAssessment['status'];
  description: string;
}

function isProtectedActivity(activity: PlannedActivity): boolean {
  return (
    activity.importance === 'MANDATORY' ||
    activity.flexibility === 'FIXED' ||
    activity.reservationRequired ||
    Boolean(activity.fixedStartAt)
  );
}

function computeDayEquivalentMinutes(
  plan: DailyDrivePlan,
  profile: SelfDriveProfile,
  countryCode: string,
): number {
  const config = loadDrivingLoadConfig(countryCode);
  const baseMinutes = plan.legs.reduce(
    (sum, leg) => sum + (leg.adjustedMinutes ?? leg.baseNavigationMinutes),
    0,
  );
  const stopOverhead = plan.activities.length * config.penalties.plannedStopMinutesMin;
  const novicePenalty =
    profile.drivers[0]?.experienceLevel === 'NOVICE_ABROAD'
      ? config.penalties.noviceAbroadMinutes
      : 0;
  const nightPenalty =
    !profile.drivingPolicy.nightDrivingAllowed && plan.legs.length > 0
      ? Math.round(baseMinutes * (config.penalties.nightDrivingMultiplier - 1))
      : 0;

  return baseMinutes + stopOverhead + novicePenalty + nightPenalty;
}

function estimateRemoveReliefMinutes(
  activity: PlannedActivity,
  countryCode: string,
): number {
  const config = loadDrivingLoadConfig(countryCode);
  return (
    config.penalties.plannedStopMinutesMin +
    activity.durationMinutes +
    activity.bufferMinutes
  );
}

function tierLabel(tier: DriveLoadTier): string {
  return tier;
}

function buildLoadRepairFallbacks(input: RecoveryGraphProjectorInput): RecoveryOption[] {
  const options: RecoveryOption[] = [];
  const sdr101 = (input.ruleResults ?? []).filter((r) => r.ruleId === 'SDR-101');
  if (sdr101.length === 0) return options;

  const config = loadDrivingLoadConfig(input.countryCode);

  for (const result of sdr101) {
    const dayRef = result.affectedRefs.find((r) => r.startsWith('day_'));
    if (!dayRef) continue;
    const dayIndex = Number(dayRef.replace('day_', ''));
    const day = input.dailyDrivePlans.find((d) => d.dayIndex === dayIndex);
    if (!day) continue;

    const beforeMinutes = computeDayEquivalentMinutes(day, input.profile, input.countryCode);
    const beforeTier = classifyDriveLoadTier(beforeMinutes, config);

    const candidates = day.activities.filter(
      (a) =>
        a.flexibility === 'REMOVABLE' &&
        (a.importance === 'OPTIONAL' || a.importance === 'RECOMMENDED'),
    );

    for (const activity of candidates) {
      const relief = estimateRemoveReliefMinutes(activity, input.countryCode);
      const afterMinutes = beforeMinutes - relief;
      const afterTier = classifyDriveLoadTier(afterMinutes, config);
      if (afterTier === beforeTier) continue;

      options.push({
        optionId: `REPAIR-SDR101-D${day.dayIndex}-${activity.ref}`,
        triggerRuleId: 'SDR-101',
        action: 'REMOVE',
        targetRefs: [activity.ref, dayRef],
        description: `删除可选停靠，释放约 ${relief} 分钟，负荷 ${tierLabel(beforeTier)}→${tierLabel(afterTier)}`,
      });
    }
  }

  return options;
}

function buildWeatherFallbacks(input: RecoveryGraphProjectorInput): RecoveryOption[] {
  const options: RecoveryOption[] = [];

  for (const day of input.dailyDrivePlans) {
    for (const activity of day.activities) {
      if (!activity.weatherSensitive) continue;
      if (activity.flexibility !== 'REPLACEABLE' && activity.flexibility !== 'REMOVABLE') {
        continue;
      }
      const isReplace = activity.flexibility === 'REPLACEABLE';
      if (isReplace && !activity.weatherFallbackPoiId) {
        continue;
      }
      options.push({
        optionId: `FALLBACK-SDR302-D${day.dayIndex}-${activity.ref}`,
        triggerRuleId: 'SDR-302',
        action: isReplace ? 'REPLACE' : 'REMOVE',
        targetRefs: [activity.ref],
        replacementRef: isReplace ? activity.weatherFallbackRef : undefined,
        replacementPoiId: isReplace ? activity.weatherFallbackPoiId : undefined,
        description: isReplace
          ? `天气敏感活动替换为预计算备选：${activity.weatherFallbackPoiId}`
          : `天气敏感活动可移除以保行程`,
      });
    }
  }

  return options;
}

/** 从 DailyDrivePlan 投影 RecoveryGraph（节点分类 + 依赖 + fallback） */
export function projectRecoveryGraph(input: RecoveryGraphProjectorInput): RecoveryGraph {
  const removableNodes: string[] = [];
  const movableNodes: string[] = [];
  const replaceableNodes: string[] = [];
  const protectedNodes: string[] = [];
  const dependencies: PlanDependency[] = buildPlanDependencies(input.dailyDrivePlans);
  const dependencyImpacts = buildSdr303DependencyImpacts({
    dailyDrivePlans: input.dailyDrivePlans,
    dependencies,
  });

  for (const day of input.dailyDrivePlans) {
    for (const leg of day.legs) {
      switch (leg.flexibility) {
        case 'REMOVABLE':
          removableNodes.push(leg.legId);
          break;
        case 'MOVABLE':
          movableNodes.push(leg.legId);
          break;
        case 'REPLACEABLE':
          replaceableNodes.push(leg.legId);
          break;
        case 'FIXED':
        default:
          if (leg.importance === 'MANDATORY') protectedNodes.push(leg.legId);
          break;
      }
    }

    for (const activity of day.activities) {
      if (isProtectedActivity(activity)) {
        protectedNodes.push(activity.ref);
        continue;
      }
      switch (activity.flexibility) {
        case 'REMOVABLE':
          removableNodes.push(activity.ref);
          break;
        case 'MOVABLE':
          movableNodes.push(activity.ref);
          break;
        case 'REPLACEABLE':
          replaceableNodes.push(activity.ref);
          break;
        default:
          break;
      }
    }

    if (day.accommodation) {
      protectedNodes.push(day.accommodation.ref);
    }
  }

  const fallbackOptions = [
    ...buildLoadRepairFallbacks(input),
    ...buildWeatherFallbacks(input),
  ];

  return {
    schemaId: RECOVERY_GRAPH_SCHEMA,
    removableNodes: [...new Set(removableNodes)],
    movableNodes: [...new Set(movableNodes)],
    replaceableNodes: [...new Set(replaceableNodes)],
    protectedNodes: [...new Set(protectedNodes)],
    dependencies,
    fallbackOptions,
    dependencyImpacts,
  };
}

export function applyRemoveActivity(
  plans: DailyDrivePlan[],
  targetRef: string,
  countryCode: string,
): DailyDrivePlan[] {
  const config = loadDrivingLoadConfig(countryCode);

  return plans.map((day) => {
    const activity = day.activities.find((a) => a.ref === targetRef);
    if (!activity) return day;

    const relief =
      activity.durationMinutes +
      activity.bufferMinutes +
      config.penalties.plannedStopMinutesMin;

    const activities = day.activities.filter((a) => a.ref !== targetRef);
    const legs = [...day.legs];
    if (legs.length > 0 && relief > 0) {
      const anchorLeg =
        legs.find((l) => l.toRef === targetRef || l.fromRef === targetRef) ??
        legs[legs.length - 1];
      const legIndex = legs.indexOf(anchorLeg);
      const adjusted = Math.max(
        0,
        (anchorLeg.adjustedMinutes ?? anchorLeg.baseNavigationMinutes) - relief,
      );
      legs[legIndex] = {
        ...anchorLeg,
        adjustedMinutes: adjusted,
      };
    }

    return { ...day, activities, legs };
  });
}

/** 模拟应用单条 RecoveryOption 并重评估（规划期 Local Repair 预览） */
export function simulateLocalRepair(input: {
  tripId: string;
  countryCode: string;
  profile: SelfDriveProfile;
  dailyDrivePlans: DailyDrivePlan[];
  option: RecoveryOption;
  statusBefore: ExecutabilityAssessment['status'];
}): LocalRepairPreview | null {
  const targetRef = input.option.targetRefs[0];
  if (!targetRef || input.option.action !== 'REMOVE') return null;

  const dayIndex = input.option.targetRefs
    .map((r) => (r.startsWith('day_') ? Number(r.replace('day_', '')) : null))
    .find((n) => n != null && !Number.isNaN(n));
  const day =
    dayIndex != null
      ? input.dailyDrivePlans.find((d) => d.dayIndex === dayIndex)
      : input.dailyDrivePlans.find((d) =>
          d.activities.some((a) => a.ref === targetRef),
        );
  if (!day) return null;

  const activity = day.activities.find((a) => a.ref === targetRef);
  if (!activity) return null;

  const config = loadDrivingLoadConfig(input.countryCode);
  const beforeMinutes = computeDayEquivalentMinutes(day, input.profile, input.countryCode);
  const beforeTier = classifyDriveLoadTier(beforeMinutes, config);
  const minutesReleased = estimateRemoveReliefMinutes(activity, input.countryCode);

  const repairedPlans = applyRemoveActivity(
    input.dailyDrivePlans,
    targetRef,
    input.countryCode,
  );
  const afterAssessment = validateTepPlanningSnapshot({
    tripId: input.tripId,
    countryCode: input.countryCode,
    profile: input.profile,
    dailyDrivePlans: repairedPlans,
  });

  const repairedDay = repairedPlans.find((d) => d.dayIndex === day.dayIndex)!;
  const afterMinutes = computeDayEquivalentMinutes(
    repairedDay,
    input.profile,
    input.countryCode,
  );
  const afterTier = classifyDriveLoadTier(afterMinutes, config);

  return {
    optionId: input.option.optionId,
    action: input.option.action,
    targetRefs: input.option.targetRefs,
    minutesReleased,
    loadTierBefore: beforeTier,
    loadTierAfter: afterTier,
    statusBefore: input.statusBefore,
    statusAfter: afterAssessment.status,
    description: input.option.description,
  };
}

/** 为 REQUIRES_REPAIR 场景生成全部 Local Repair 预览 */
export function projectLocalRepairPreviews(input: {
  tripId: string;
  countryCode: string;
  profile: SelfDriveProfile;
  dailyDrivePlans: DailyDrivePlan[];
  recoveryGraph: RecoveryGraph;
  assessmentStatus: ExecutabilityAssessment['status'];
}): LocalRepairPreview[] {
  if (input.assessmentStatus !== 'REQUIRES_REPAIR') return [];

  return input.recoveryGraph.fallbackOptions
    .map((option) =>
      simulateLocalRepair({
        tripId: input.tripId,
        countryCode: input.countryCode,
        profile: input.profile,
        dailyDrivePlans: input.dailyDrivePlans,
        option,
        statusBefore: input.assessmentStatus,
      }),
    )
    .filter((p): p is LocalRepairPreview => p != null);
}

/** 查询编辑某节点时的下游依赖影响（SDR-303 消费面） */
export function resolveDependencyImpact(
  graph: RecoveryGraph,
  nodeRef: string,
): PlanDependency[] {
  const direct = graph.dependencies.filter(
    (d) => d.fromRef === nodeRef || d.toRef === nodeRef,
  );
  const downstream = graph.dependencies.filter((d) =>
    direct.some((x) => x.toRef === d.fromRef),
  );
  return [...direct, ...downstream];
}

/** 按 affectedRef 列出可移除候选 */
export function listRemovableCandidatesForDay(
  graph: RecoveryGraph,
  dayRef: string,
): string[] {
  return graph.removableNodes.filter((ref) => ref !== dayRef);
}
