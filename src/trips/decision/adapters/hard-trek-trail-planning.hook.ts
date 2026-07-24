import type { TripWorldState } from '../world-model';
import {
  TrailPlanningAdapter,
  type TrailPlanPreviewResult,
} from './trail-planning.adapter';

export const HARD_TREK_ROUTE_NAMES = [
  'IS_LAUGAVEGUR',
  'IS_TREKKING_WILDERNESS',
  'NEPAL_EBC_TREK',
] as const;

export type HardTrekRouteName = (typeof HARD_TREK_ROUTE_NAMES)[number];

export function isHardTrekTrailPlanningEnabled(): boolean {
  return process.env.ENABLE_HARD_TREK_TRAIL_PLANNING !== 'false';
}

function isHardTrekCandidate(route: { name: string; tags?: string[] }): boolean {
  if (HARD_TREK_ROUTE_NAMES.includes(route.name as HardTrekRouteName)) return true;
  const tags = route.tags ?? [];
  return tags.some(
    (t) => t === '徒步' || /hik|trek|trail/i.test(String(t)),
  );
}

export async function attachHardTrekTrailPlanToState(
  state: TripWorldState,
  routeDirection: { name: string; tags?: string[] },
  adapter: TrailPlanningAdapter,
  options?: { longestHike?: 0 | 1 | 2 | 3 | 4; placeIds?: number[] },
): Promise<TrailPlanPreviewResult | undefined> {
  if (!isHardTrekTrailPlanningEnabled()) return undefined;

  const name = routeDirection.name;
  if (!isHardTrekCandidate(routeDirection)) {
    return undefined;
  }

  const longestHike =
    (state.context as { preferences?: { longestHike?: number } }).preferences?.longestHike ??
    options?.longestHike ??
    2;

  const preview = await adapter.buildPreview({
    routeDirectionName: name,
    longestHike: Math.min(4, Math.max(0, longestHike)) as 0 | 1 | 2 | 3 | 4,
    placeIds: options?.placeIds ?? [],
  });

  const embeddedHint = state.signals.embeddedHiking;
  if (
    embeddedHint?.effectiveDurationDays != null &&
    embeddedHint.effectiveDurationDays > 0 &&
    preview.segments.length > embeddedHint.effectiveDurationDays
  ) {
    preview.segments = preview.segments.slice(0, embeddedHint.effectiveDurationDays);
    preview.summary.suggestedDays = embeddedHint.effectiveDurationDays;
    preview.messageZh = `混合出行 embedded：Trail 段按徒步片段 ${embeddedHint.effectiveDurationDays} 日裁剪（非整单天数）`;
  }

  state.signals.hardTrekTrailPlan = preview;
  if (preview.mode === 'trail_segments') {
    state.signals.planningMode = 'trail_first';
  }

  const overDays = preview.segments.filter((s) => !s.suitable);
  if (!state.signals.alerts) state.signals.alerts = [];
  state.signals.alerts.push({
    code: 'HARD_TREK_TRAIL_PLAN',
    severity: overDays.length ? 'warn' : 'info',
    message:
      overDays.length > 0
        ? `硬徒步计划：${overDays.length} 天爬升超出体能阈值（POI 主路径未替换）`
        : `硬徒步 Trail 段已挂载：${preview.segments.length} 日`,
  });

  state.signals.lastUpdatedAt = new Date().toISOString();
  return preview;
}
