/**
 * Light RoutePlanDraft → TripPlan for Constraint Gateway shadow evaluation.
 * Not a full planning materializer — order + poi metadata only.
 */

import type { RoutePlanDraft } from '../../../trips/decision/shared/world-model.types';
import type { PlanDay, PlanSlot, TripPlan } from '../../../trips/decision/plan-model';
import { minutesToHhMm, segmentNodeKey } from './apply-day-order-to-route-plan.util';

export function routePlanDraftToTripPlan(
  draft: RoutePlanDraft,
  opts?: {
    startMinByNodeId?: Record<string, number>;
    version?: string;
  },
): TripPlan {
  const byDay = new Map<number, typeof draft.segments>();
  for (const seg of draft.segments ?? []) {
    const list = byDay.get(seg.dayIndex) ?? [];
    list.push(seg);
    byDay.set(seg.dayIndex, list);
  }

  const days: PlanDay[] = [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([dayIndex, segs], idx) => {
      const timeSlots: PlanSlot[] = segs.map((seg, i) => {
        const meta = (seg.metadata ?? {}) as Record<string, unknown>;
        const key = segmentNodeKey(seg);
        const startMin = opts?.startMinByNodeId?.[key];
        const time =
          (typeof meta.startTime === 'string' && meta.startTime) ||
          (startMin != null ? minutesToHhMm(startMin) : minutesToHhMm(9 * 60 + i * 60));
        const poiId =
          typeof meta.poiId === 'string'
            ? meta.poiId
            : typeof meta.poi_id === 'string'
              ? meta.poi_id
              : undefined;
        return {
          id: `slot_${seg.segmentId}`,
          time: time as TripPlan['days'][0]['timeSlots'][0]['time'],
          title: String(meta.poiName ?? meta.poi_name ?? key),
          type: 'sightseeing',
          poiId,
          locked: Boolean(meta.locked ?? meta.booked),
          reasons: ['ortools_shadow_materialize'],
        };
      });
      return {
        day: idx + 1,
        date: `1970-01-${String(Math.min(28, dayIndex + 1)).padStart(2, '0')}` as PlanDay['date'],
        timeSlots,
      };
    });

  return {
    version: opts?.version ?? 'ortools-shadow-trip-plan@v1',
    createdAt: new Date().toISOString(),
    tripId: draft.tripId,
    days,
  };
}
