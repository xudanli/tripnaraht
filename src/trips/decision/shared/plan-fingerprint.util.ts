import type { RoutePlanDraft } from './world-model.types';

/**
 * 路线草案指纹：用于 persona closure 检测 Neptune REPLACE 是否实质改 plan。
 */
export function fingerprintRoutePlan(plan: RoutePlanDraft): string {
  const segments = (plan.segments ?? [])
    .map((s) => {
      const id = (s as { id?: string; segmentId?: string }).id
        ?? (s as { segmentId?: string }).segmentId
        ?? '';
      const poi = (s as { poiId?: string }).poiId ?? '';
      return `${id}:${poi}`;
    })
    .sort()
    .join('|');
  return `${plan.tripId ?? ''}#${plan.routeDirectionId ?? ''}#${segments}`;
}

export function planFingerprintChanged(before: RoutePlanDraft, after: RoutePlanDraft): boolean {
  return fingerprintRoutePlan(before) !== fingerprintRoutePlan(after);
}
