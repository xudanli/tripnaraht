import type { Itinerary } from '../interfaces/trip-plan.interface';
import { computePostponeTimelineFragility, reliabilityScoreFromMinBuffer } from './timeline-fragility.util';
import { projectItineraryForNegotiationAlternative } from './negotiation-itinerary-projection.util';

/** Auditable label for the on-time mapping (buffer minutes → display probability). */
export const STRATEGY_ON_TIME_MODEL_VERSION = 'tripnara.strategy_p.v1';

export const STRATEGY_ON_TIME_MODEL_DESCRIPTION =
  'Per hard-booking segment: buffer_min = latest_arrival − start (minutes); reliability = clamp((buffer_min−5)/15,0,1); segment P = 0.5 + 0.5×reliability. Trip interval = [min P, max P] over critical hard bookings. UPGRADE path applies an optimistic floor (PT-heal).';

/** Bottleneck threshold for heatmap: segments with reliability below this in baseline + all alternatives. */
export const HEATMAP_BOTTLENECK_RELIABILITY_THRESHOLD = 0.2;

/**
 * Conservative “on-time probability” index in [0,1] from remaining punctuality buffer (minutes).
 * Not a calibrated frequentist probability; monotonic and explainable for Strategy Map UI.
 */
export function onTimeProbabilityIndexFromBufferMinutes(bufferMinutes: number | null | undefined): number | null {
  if (bufferMinutes == null || !Number.isFinite(bufferMinutes)) return null;
  if (bufferMinutes < 0) return 0.05;
  const r = reliabilityScoreFromMinBuffer(bufferMinutes);
  if (r === undefined) return null;
  return Math.max(0, Math.min(1, 0.5 + 0.5 * r));
}

function flattenItems(itinerary: any): any[] {
  const days: any[] = Array.isArray(itinerary?.days) ? itinerary.days : [];
  return days.flatMap((d: any) => (Array.isArray(d?.items) ? d.items : []));
}

function hardBookingBufferMinutes(it: any): number | null {
  if (!it || typeof it !== 'object') return null;
  if (!Boolean(it?.metadata?.hard_booking)) return null;
  const st = typeof it.start_time === 'string' ? Date.parse(it.start_time) : NaN;
  const latestIso =
    it?.metadata?.latest_arrival_time ??
    it?.metadata?.latest_arrival_time_iso ??
    it?.metadata?.booking_window_end_iso ??
    null;
  const latest = typeof latestIso === 'string' ? Date.parse(latestIso) : NaN;
  if (!Number.isFinite(st) || !Number.isFinite(latest)) return null;
  return (latest - st) / 60_000;
}

function criticalPathSegmentIds(baselineItinerary: any, projectedForUpgrade: any): string[] {
  const baseItems = flattenItems(baselineItinerary);
  const ids: string[] = [];
  for (const it of baseItems) {
    if (Boolean(it?.metadata?.hard_booking)) {
      const id = String(it?.id ?? it?.item_id ?? '').trim();
      if (id) ids.push(id);
    }
  }
  const transit = baseItems.find((x) => {
    const t = String(x?.type ?? '').toUpperCase();
    return t === 'TRANSIT' || t === 'PUBLIC_TRANSIT' || t === 'TRANSFER';
  });
  if (transit) {
    const id = String(transit?.id ?? transit?.item_id ?? '').trim();
    if (id && !ids.includes(id)) ids.push(id);
  }
  const projItems = flattenItems(projectedForUpgrade);
  for (const it of projItems) {
    const id = String(it?.id ?? it?.item_id ?? '').trim();
    if (!id) continue;
    if (ids.includes(id)) continue;
    if (String(it?.type ?? '').toUpperCase() === 'DRIVE' && it?.metadata?.resolution?.upgraded_from) {
      ids.push(id);
    }
  }
  return ids;
}

function segmentRowsForAlternative(params: { baselineItinerary: any; projectedItinerary: any }): any[] {
  const baseById = new Map<string, any>();
  for (const it of flattenItems(params.baselineItinerary)) {
    const id = String(it?.id ?? it?.item_id ?? '').trim();
    if (id) baseById.set(id, it);
  }
  const out: any[] = [];
  for (const after of flattenItems(params.projectedItinerary)) {
    const id = String(after?.id ?? after?.item_id ?? '').trim();
    if (!id) continue;
    const before = baseById.get(id);
    if (!before) continue;
    const hb = Boolean(after?.metadata?.hard_booking);
    const buf = hb ? hardBookingBufferMinutes(after) : null;
    const segP = hb ? onTimeProbabilityIndexFromBufferMinutes(buf) : null;
    const segInterval: [number, number] | null =
      segP != null ? [Math.max(0, segP - 0.08), Math.min(1, segP + 0.08)] : null;
    out.push({
      segment_id: id,
      item_type: String(after?.type ?? before?.type ?? ''),
      hard_booking: hb,
      before: {
        start_iso: typeof before.start_time === 'string' ? before.start_time : undefined,
        end_iso: typeof before.end_time === 'string' ? before.end_time : undefined,
      },
      after: {
        start_iso: typeof after.start_time === 'string' ? after.start_time : undefined,
        end_iso: typeof after.end_time === 'string' ? after.end_time : undefined,
      },
      punctuality_buffer_minutes: buf,
      reliability_score: hb ? reliabilityScoreFromMinBuffer(buf) : null,
      on_time_probability: segP,
      on_time_probability_interval: segInterval,
    });
  }
  return out.sort((a, b) => String(a.segment_id).localeCompare(String(b.segment_id)));
}

function tripIntervalFromSegments(segments: any[]): [number, number] | null {
  const ps = segments
    .filter((s) => s?.hard_booking && typeof s?.on_time_probability === 'number' && Number.isFinite(s.on_time_probability))
    .map((s) => Number(s.on_time_probability));
  if (!ps.length) return null;
  return [Math.min(...ps), Math.max(...ps)];
}

function tripPointFromFragility(frag: { min_buffer_minutes: number | null } | null): number | null {
  if (!frag || frag.min_buffer_minutes == null) return null;
  return onTimeProbabilityIndexFromBufferMinutes(frag.min_buffer_minutes);
}

export async function buildStrategyImpactMap(params: {
  baselineItinerary: Itinerary | undefined;
  alternatives: any[];
  negotiation_session_id: string;
  negotiation_payload: any;
  prefetchedEvidence: any[];
  resolveTravelMinutes: (cur: any, next: any) => Promise<number | undefined>;
  findCachedTravelMinutes: (cur: any, next: any) => number | undefined;
}): Promise<Record<string, any> | undefined> {
  const base = params.baselineItinerary as any;
  if (!base || !Array.isArray(params.alternatives) || params.alternatives.length < 2) return undefined;

  const fragilityArgs = {
    itinerary: base,
    prefetchedEvidence: params.prefetchedEvidence,
    resolveTravelMinutes: params.resolveTravelMinutes,
    findCachedTravelMinutes: params.findCachedTravelMinutes,
  };

  const fragBaseline = await computePostponeTimelineFragility({
    ...fragilityArgs,
    postponeMinutes: 0,
  });

  let projectedUpgrade: any;
  try {
    projectedUpgrade = projectItineraryForNegotiationAlternative({
      itinerary: base,
      alternative_id: 'UPGRADE_TO_DRIVE',
      session_id: params.negotiation_session_id,
      negotiation_payload: params.negotiation_payload,
      preview: true,
    });
  } catch {
    projectedUpgrade = base;
  }

  const criticalIds = criticalPathSegmentIds(base, projectedUpgrade);

  const baselineSegmentsAll = segmentRowsForAlternative({ baselineItinerary: base, projectedItinerary: base });

  const baselineTripP = tripPointFromFragility(fragBaseline);
  const baselineBuffers = flattenItems(base)
    .filter((it) => Boolean(it?.metadata?.hard_booking))
    .map((it) => hardBookingBufferMinutes(it))
    .filter((b): b is number => typeof b === 'number' && Number.isFinite(b));
  const baselineInterval: [number, number] | null =
    baselineBuffers.length > 0
      ? (() => {
          const ps = baselineBuffers.map((b) => onTimeProbabilityIndexFromBufferMinutes(b)).filter((x): x is number => x != null);
          return ps.length ? [Math.min(...ps), Math.max(...ps)] : null;
        })()
      : baselineTripP != null
        ? [baselineTripP, baselineTripP]
        : null;

  const altOut: any[] = [];

  for (const raw of params.alternatives) {
    const aid = String(raw?.id ?? '');
    if (aid !== 'UPGRADE_TO_DRIVE' && aid !== 'POSTPONE_SCHEDULE') continue;

    let projected: any;
    try {
      projected = projectItineraryForNegotiationAlternative({
        itinerary: base,
        alternative_id: aid as 'UPGRADE_TO_DRIVE' | 'POSTPONE_SCHEDULE',
        session_id: params.negotiation_session_id,
        negotiation_payload: params.negotiation_payload,
        preview: true,
      });
    } catch {
      continue;
    }

    const cost = Number(raw?.cost_delta_usd);
    const td = Number(raw?.time_delta_minutes);
    const segments = segmentRowsForAlternative({
      baselineItinerary: base,
      projectedItinerary: projected,
    });

    // Projected itineraries already embed schedule shifts; do not add postponeMinutes again.
    const fragAlt = await computePostponeTimelineFragility({
      ...fragilityArgs,
      itinerary: projected,
      postponeMinutes: 0,
    });

    let tripP = tripPointFromFragility(fragAlt);
    let interval = tripIntervalFromSegments(segments) ?? (tripP != null ? ([tripP, tripP] as [number, number]) : null);

    if (aid === 'UPGRADE_TO_DRIVE') {
      const floor = 0.95;
      if (tripP != null) tripP = Math.max(tripP, floor);
      if (interval) {
        interval = [Math.max(interval[0], floor - 0.05), Math.min(1, Math.max(interval[1], floor))];
      } else {
        interval = [floor - 0.05, 1];
      }
    }

    altOut.push({
      alternative_id: aid,
      cost_delta_usd: Number.isFinite(cost) ? cost : 0,
      time_delta_minutes: Number.isFinite(td) ? td : 0,
      reliability_score: typeof raw?.reliability_score === 'number' ? raw.reliability_score : undefined,
      reasoning_tags: Array.isArray(raw?.reasoning_tags) ? [...raw.reasoning_tags].sort() : undefined,
      trip_on_time_probability: tripP,
      trip_on_time_probability_interval: interval,
      min_buffer_minutes: fragAlt?.min_buffer_minutes ?? null,
      risk_level: fragAlt?.risk_level,
      segment_comparisons: segments.filter((s) => criticalIds.includes(String(s.segment_id))),
      segment_comparisons_all: segments,
    });
  }

  if (!altOut.length) return undefined;

  // Heatmap: identify segments that are fragile in baseline + all alternatives (common pressure).
  const baselineBufById = new Map<string, number>();
  for (const s of baselineSegmentsAll) {
    if (!s?.hard_booking) continue;
    const id = String(s.segment_id ?? '').trim();
    const b = Number(s.punctuality_buffer_minutes);
    if (id && Number.isFinite(b)) baselineBufById.set(id, b);
  }

  const commonHardBookingIds = Array.from(baselineBufById.keys()).filter((id) =>
    altOut.every((a) => Array.isArray(a.segment_comparisons_all) && a.segment_comparisons_all.some((s: any) => String(s?.segment_id ?? '') === id && s?.hard_booking)),
  );

  const bottleneckIds = new Set<string>();
  const heat_zones: any[] = [];
  for (const id of commonHardBookingIds) {
    const b0 = baselineBufById.get(id);
    const r0 = reliabilityScoreFromMinBuffer(b0);
    if (r0 == null || r0 >= HEATMAP_BOTTLENECK_RELIABILITY_THRESHOLD) continue;
    let ok = true;
    const details: Record<string, { buffer_minutes: number | null; reliability: number | null }> = {
      BASELINE: { buffer_minutes: b0 ?? null, reliability: r0 ?? null },
    };
    for (const a of altOut) {
      const s = (a.segment_comparisons_all ?? []).find((x: any) => String(x?.segment_id ?? '') === id);
      const buf = Number(s?.punctuality_buffer_minutes);
      const rr = reliabilityScoreFromMinBuffer(Number.isFinite(buf) ? buf : null);
      details[String(a.alternative_id)] = { buffer_minutes: Number.isFinite(buf) ? buf : null, reliability: rr ?? null };
      if (rr == null || rr >= HEATMAP_BOTTLENECK_RELIABILITY_THRESHOLD) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;
    bottleneckIds.add(id);
    heat_zones.push({
      segment_id: id,
      bottleneck_node: true,
      criterion: `reliability < ${HEATMAP_BOTTLENECK_RELIABILITY_THRESHOLD} in baseline + all alternatives`,
      details,
    });
  }

  if (bottleneckIds.size) {
    for (const a of altOut) {
      a.segment_comparisons = (a.segment_comparisons ?? []).map((s: any) =>
        bottleneckIds.has(String(s?.segment_id ?? '')) ? { ...s, bottleneck_node: true } : s,
      );
    }
  }

  return {
    on_time_model: {
      version: STRATEGY_ON_TIME_MODEL_VERSION,
      description: STRATEGY_ON_TIME_MODEL_DESCRIPTION,
    },
    critical_path_segment_ids: criticalIds,
    heat_zones,
    baseline: {
      trip_on_time_probability: baselineTripP,
      trip_on_time_probability_interval: baselineInterval,
      cost_delta_usd: 0,
      time_shift_minutes: 0,
    },
    alternatives: altOut.map(({ segment_comparisons_all: _segmentComparisonsAll, ...rest }: any) => rest),
  };
}
