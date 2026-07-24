/**
 * 从 Readiness Pack 结果投影「出发准备」域 — 排除方案可执行性 findings
 */

import type { ReadinessCategory } from '../../readiness/types/readiness-pack.types';
import type {
  ReadinessCheckResult,
  ReadinessFindingItem,
} from '../../readiness/types/readiness-findings.types';

/** 出发准备 Pack 维度 — 不含 schedule/transport/access 等方案维度 */
export const DEPARTURE_PREP_CATEGORIES: ReadonlySet<ReadinessCategory> = new Set([
  'entry_transit',
  'health_insurance',
  'gear_packing',
  'activities_bookings',
  'logistics',
  'safety_hazards',
]);

/** issueKind / 特征 — 来自 coverage/feasibility 的 findings 应排除 */
const PLAN_FEASIBILITY_ISSUE_KIND_PREFIXES = [
  'poi_access_',
  'experience_regret',
  'buffer_',
  'daily_drive',
  'road_class',
  'same_day_travel',
  'transfer_buffer',
  'coverage_',
  'closure_',
  'schedule_',
] as const;

export function isPlanFeasibilityFindingItem(item: ReadinessFindingItem): boolean {
  if (item.tripScope != null) return true;
  if (item.visitorAccess != null) return true;
  const kind = String(item.issueKind ?? '').toLowerCase();
  if (kind && PLAN_FEASIBILITY_ISSUE_KIND_PREFIXES.some((p) => kind.startsWith(p))) {
    return true;
  }
  const cat = String(item.category ?? '').toLowerCase();
  if (
    cat === 'schedule' ||
    cat === 'transport' ||
    cat === 'environment' ||
    cat === 'access_capacity' ||
    cat === 'experience_expectation' ||
    cat === 'team_fit' ||
    cat === 'itinerary_completeness'
  ) {
    return true;
  }
  return false;
}

export function isDeparturePrepFindingItem(item: ReadinessFindingItem): boolean {
  if (isPlanFeasibilityFindingItem(item)) return false;
  return DEPARTURE_PREP_CATEGORIES.has(item.category);
}

export function collectDeparturePrepItems(result: ReadinessCheckResult): ReadinessFindingItem[] {
  const items: ReadinessFindingItem[] = [];
  for (const finding of result.findings ?? []) {
    for (const bucket of [
      finding.blockers,
      finding.must,
      finding.should,
      finding.optional,
    ] as ReadinessFindingItem[][]) {
      for (const item of bucket ?? []) {
        if (isDeparturePrepFindingItem(item)) {
          items.push(item);
        }
      }
    }
  }
  return items;
}

export function partitionDeparturePrepItems(items: ReadinessFindingItem[]): {
  blockers: ReadinessFindingItem[];
  must: ReadinessFindingItem[];
  should: ReadinessFindingItem[];
  optional: ReadinessFindingItem[];
} {
  const blockers: ReadinessFindingItem[] = [];
  const must: ReadinessFindingItem[] = [];
  const should: ReadinessFindingItem[] = [];
  const optional: ReadinessFindingItem[] = [];
  for (const item of items) {
    if (item.level === 'blocker') blockers.push(item);
    else if (item.level === 'must') must.push(item);
    else if (item.level === 'should') should.push(item);
    else optional.push(item);
  }
  return { blockers, must, should, optional };
}

export function computePreparationCompletion(input: {
  items: ReadinessFindingItem[];
  checkedFindingIds: Set<string>;
  notApplicableFindingIds: Set<string>;
}): {
  openBlockerCount: number;
  openMustCount: number;
  openShouldCount: number;
  completedItemCount: number;
  totalTrackedItemCount: number;
  completionPercent: number;
} {
  const tracked = input.items.filter(
    (i) => i.level === 'blocker' || i.level === 'must' || i.level === 'should',
  );
  const isResolved = (id: string) =>
    input.checkedFindingIds.has(id) || input.notApplicableFindingIds.has(id);

  let openBlockerCount = 0;
  let openMustCount = 0;
  let openShouldCount = 0;
  let completedItemCount = 0;

  for (const item of tracked) {
    const resolved = isResolved(item.id);
    if (resolved) {
      completedItemCount += 1;
      continue;
    }
    if (item.level === 'blocker') openBlockerCount += 1;
    else if (item.level === 'must') openMustCount += 1;
    else if (item.level === 'should') openShouldCount += 1;
  }

  const totalTrackedItemCount = tracked.length;
  const completionPercent =
    totalTrackedItemCount === 0
      ? 100
      : Math.round((completedItemCount / totalTrackedItemCount) * 100);

  return {
    openBlockerCount,
    openMustCount,
    openShouldCount,
    completedItemCount,
    totalTrackedItemCount,
    completionPercent,
  };
}
