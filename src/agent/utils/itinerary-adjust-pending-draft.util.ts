/**
 * ITINERARY_ADJUST 草案待确认：写入 TripRun.metadata 供「应用到行程」按钮读取。
 */

import type { Itinerary, ItineraryDay, OrchestratorState } from '../interfaces/trip-plan.interface';
import type { ItineraryAdjustOptimizationResult } from './itinerary-adjust-optimization-summary.util';
import { applyPacingRelaxToAdjustTargetState } from '../../skills/itinerary/experience-curator-pacing-relax.util';

export const PENDING_ITINERARY_ADJUST_DRAFT_META_KEY = 'pending_itinerary_adjust_draft';

export type PendingItineraryAdjustDraft = {
  trip_id: string;
  target_date_iso: string;
  target_day_number?: number;
  saved_at: string;
  request_id: string;
  itinerary_day: ItineraryDay;
  itinerary_adjust_result?: ItineraryAdjustOptimizationResult;
};

export function buildPendingItineraryAdjustDraft(
  state: OrchestratorState,
  tripId: string,
): PendingItineraryAdjustDraft | undefined {
  const md = (state.metadata ?? {}) as Record<string, unknown>;
  const adjust = md.itinerary_adjust_result as ItineraryAdjustOptimizationResult | undefined;
  const autoApply = md.itinerary_adjust_auto_apply as { applied?: boolean } | undefined;
  if (!adjust || autoApply?.applied === true || adjust.applied === true) return undefined;

  const targetDateIso = String(
    adjust.target_date_iso ??
      md.itinerary_adjust_target_date_iso ??
      '',
  ).slice(0, 10);
  if (!targetDateIso || !state.itinerary?.days?.length) return undefined;

  const working: OrchestratorState = {
    ...state,
    itinerary: {
      ...state.itinerary,
      days: state.itinerary.days.map((d) => ({
        ...d,
        items: d.items.map((it) => ({ ...it })),
      })),
    },
  };
  applyPacingRelaxToAdjustTargetState(working);

  const day = working.itinerary!.days.find(
    (d) => String(d.date ?? '').slice(0, 10) === targetDateIso,
  );
  if (!day?.items?.length) return undefined;

  return {
    trip_id: tripId,
    target_date_iso: targetDateIso,
    target_day_number: adjust.target_day_number,
    saved_at: new Date().toISOString(),
    request_id: state.request_id,
    itinerary_day: {
      date: targetDateIso,
      items: day.items.map((it) => ({ ...it })),
    },
    itinerary_adjust_result: adjust,
  };
}

export function readPendingItineraryAdjustDraft(
  metadata: Record<string, unknown> | null | undefined,
): PendingItineraryAdjustDraft | undefined {
  const raw = metadata?.[PENDING_ITINERARY_ADJUST_DRAFT_META_KEY];
  if (!raw || typeof raw !== 'object') return undefined;
  const d = raw as PendingItineraryAdjustDraft;
  if (!d.trip_id || !d.target_date_iso || !d.itinerary_day?.items?.length) return undefined;
  return d;
}

export function pendingDraftFromRequestSnapshot(params: {
  tripId: string;
  snapshot?: {
    target_date_iso: string;
    target_day_number?: number;
    items?: Array<{
      type?: string;
      start_window?: string;
      end_window?: string;
      location_ref?: { name?: string; place_id?: string | number };
      name?: string;
      id?: string;
    }>;
  };
}): PendingItineraryAdjustDraft | undefined {
  const snap = params.snapshot;
  if (!snap?.target_date_iso || !snap.items?.length) return undefined;
  const target = snap.target_date_iso.slice(0, 10);
  return {
    trip_id: params.tripId,
    target_date_iso: target,
    target_day_number: snap.target_day_number,
    saved_at: new Date().toISOString(),
    request_id: 'client-snapshot',
    itinerary_day: {
      date: target,
      items: snap.items.map((it, idx) => ({
        id: it.id ?? `draft-snap-${target}-${idx}`,
        type: (it.type ?? 'POI') as ItineraryDay['items'][0]['type'],
        start_window: it.start_window,
        end_window: it.end_window,
        location_ref: {
          name: it.location_ref?.name ?? it.name ?? '',
          place_id:
            it.location_ref?.place_id != null
              ? String(it.location_ref.place_id)
              : undefined,
        },
        evidence_refs: [],
        verified: false,
      })),
    },
  };
}

export function draftSnapshotFromTimeline(
  timeline: Itinerary['days'] | undefined,
  targetDateIso: string,
): ItineraryDay | undefined {
  const target = targetDateIso.slice(0, 10);
  const day = timeline?.find((d) => String(d.date ?? '').slice(0, 10) === target);
  if (!day?.items?.length) return undefined;
  return {
    date: target,
    items: day.items.map((it) => ({ ...it })),
  };
}
