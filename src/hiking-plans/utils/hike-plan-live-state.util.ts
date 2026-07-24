import type { HikePlanLiveEvent, HikePlanLiveState } from '../types/hike-plan.types';
import { DEFAULT_ROUTE_DEVIATION_THRESHOLD_M } from './hike-plan-route-deviation.util';

function normalizeLiveEvents(raw: unknown): HikePlanLiveEvent[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .filter((e) => e != null && typeof e === 'object')
    .map((e, index) => {
      const row = e as Record<string, unknown>;
      const message =
        typeof row.message === 'string'
          ? row.message
          : typeof row.noteZh === 'string'
            ? row.noteZh
            : undefined;
      const thresholdRaw = row.threshold;
      let threshold: HikePlanLiveEvent['threshold'];
      if (thresholdRaw && typeof thresholdRaw === 'object') {
        const t = thresholdRaw as Record<string, unknown>;
        if (typeof t.metric === 'string' && typeof t.current === 'number') {
          threshold = {
            metric: t.metric,
            current: t.current,
            value: typeof t.value === 'number' ? t.value : 0,
          };
        }
      }

      return {
        id: String(row.id ?? `event-${index + 1}`),
        type: String(row.type ?? 'info'),
        at: typeof row.at === 'string' ? row.at : new Date().toISOString(),
        message,
        noteZh: typeof row.noteZh === 'string' ? row.noteZh : message,
        threshold,
      };
    });
}

/** GET live-state 时数字字段默认 0，避免前端读到 undefined */
export function normalizeLiveState(raw: unknown): HikePlanLiveState {
  const s =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as HikePlanLiveState)
      : {};

  const routeDeviationThresholdM =
    typeof s.routeDeviationThresholdM === 'number' && s.routeDeviationThresholdM > 0
      ? s.routeDeviationThresholdM
      : DEFAULT_ROUTE_DEVIATION_THRESHOLD_M;

  return {
    currentDay: typeof s.currentDay === 'number' ? s.currentDay : 0,
    currentSegmentIndex:
      typeof s.currentSegmentIndex === 'number' ? s.currentSegmentIndex : 0,
    progressPct: typeof s.progressPct === 'number' ? s.progressPct : 0,
    lastCheckpointId: s.lastCheckpointId,
    routeDeviationThresholdM,
    events: normalizeLiveEvents(s.events),
  };
}

export function defaultLiveStateForStart(): HikePlanLiveState {
  return {
    currentDay: 1,
    currentSegmentIndex: 1,
    progressPct: 0,
    events: [],
  };
}
