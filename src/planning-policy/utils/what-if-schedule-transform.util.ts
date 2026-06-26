import type { DayScheduleResult } from '../interfaces/scheduler.interface';

/** Shift POI and all following stops earlier by `minutes`. */
export function shiftScheduleEarlier(
  schedule: DayScheduleResult,
  poiId: string,
  minutes: number,
): DayScheduleResult {
  const delta = Math.max(0, Math.floor(minutes));
  if (delta === 0) return schedule;

  const idx = schedule.stops.findIndex((s) => s.kind === 'POI' && s.id === poiId);
  if (idx < 0) return schedule;

  const stops = schedule.stops.map((s, i) => {
    if (i < idx) return s;
    return {
      ...s,
      startMin: Math.max(0, s.startMin - delta),
      endMin: Math.max(0, s.endMin - delta),
    };
  });

  return { ...schedule, stops };
}

/** Swap target POI with nearest neighbor POI in direction. */
export function swapWithNeighborPoi(
  schedule: DayScheduleResult,
  poiId: string,
  direction: 'PREV' | 'NEXT',
): DayScheduleResult {
  const stops = [...schedule.stops];
  const idx = stops.findIndex((s) => s.kind === 'POI' && s.id === poiId);
  if (idx < 0) return schedule;

  const step = direction === 'PREV' ? -1 : 1;
  let j = idx + step;
  while (j >= 0 && j < stops.length && stops[j].kind !== 'POI') {
    j += step;
  }
  if (j < 0 || j >= stops.length) return schedule;

  const tmp = stops[idx];
  stops[idx] = stops[j]!;
  stops[j] = tmp!;
  return { ...schedule, stops };
}

/** Remove a POI stop (minimal perturbation — does not rebuild timeline). */
export function removePoiFromSchedule(
  schedule: DayScheduleResult,
  poiId: string,
): DayScheduleResult {
  const stops = schedule.stops.filter((s) => !(s.kind === 'POI' && s.id === poiId));
  if (stops.length === schedule.stops.length) return schedule;
  return { ...schedule, stops };
}

/** Insert buffer minutes before target POI by shifting it and suffix earlier (same as negative shift on suffix). */
export function addBufferBeforePoi(
  schedule: DayScheduleResult,
  poiId: string,
  bufferMinutes: number,
): DayScheduleResult {
  return shiftScheduleEarlier(schedule, poiId, bufferMinutes);
}
