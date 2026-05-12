import type { RealityResource } from './reality-resource.types';
import type { AllocationOutcome } from './allocation.types';

/**
 * 根据仲裁结果单调增加负载（占位；生产应配合预订确认回滚）。
 */
export function applyAllocationLoads(
  resources: Map<string, RealityResource>,
  outcomes: AllocationOutcome[],
  incrementPerWin = 1,
): Map<string, RealityResource> {
  const next = new Map<string, RealityResource>();
  for (const [k, v] of resources) {
    next.set(k, { ...v });
  }

  for (const o of outcomes) {
    const r = next.get(o.resourceId);
    if (!r) continue;
    r.currentLoad = Math.min(r.capacity, r.currentLoad + incrementPerWin);
  }

  return next;
}
