import type { RoutePlanDraft } from '../shared/world-model.types';

/** 路由骨架签名：日序 + segmentId，用于 freezeRouteSelection 迟滞锚定 */
export function routeSkeletonSignature(plan: RoutePlanDraft | undefined | null): string {
  const segs = plan?.segments ?? [];
  if (segs.length === 0) return '';
  return segs
    .map((s) => `${s.dayIndex ?? 0}:${String(s.segmentId ?? '')}`)
    .sort()
    .join('|');
}
