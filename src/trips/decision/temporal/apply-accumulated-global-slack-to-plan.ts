/**
 * 将 ACCUMULATE_GLOBAL_SLACK 类 TimeDrift 按日汇总到 PlanDay.weatherExecution
 *
 * @deprecated P5-CLOSE：调度语义以 ExecutionOverlayFrame 为准；本函数仅为 drift→plan 材料化保留。
 */

import type { TripPlan } from '../plan-model';

export function applyAccumulatedGlobalSlackToPlanDays(plan: TripPlan): void {
  const drifts = plan.temporal?.timeDrifts ?? [];
  const byDate = new Map<string, number>();

  for (const d of drifts) {
    if (d.propagationPolicy !== 'ACCUMULATE_GLOBAL_SLACK') {
      continue;
    }
    byDate.set(d.date, (byDate.get(d.date) ?? 0) + d.deltaMinutes);
  }

  for (const day of plan.days) {
    const slack = byDate.get(day.date);
    if (slack === undefined || slack <= 0) {
      continue;
    }
    day.weatherExecution = {
      ...(day.weatherExecution ?? {}),
      accumulatedGlobalSlackMinutes: slack,
    };
  }
}
