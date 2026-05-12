import { Inject, Injectable, Optional } from '@nestjs/common';
import { validateSync } from 'class-validator';
import { createHash } from 'crypto';
import type { Itinerary, DecisionLogEntry } from '../interfaces/trip-plan.interface';
import type { RouteAndRunRequestDto, NegotiationPayloadDto } from '../dto/route-and-run.dto';
import { EvidenceCacheService } from '../../skills/world/services/evidence-cache.service';
import { AccessTrackerService } from '../../skills/world/services/access-tracker.service';
import { TravelTimeRouterService } from './travel-time-router.service';
import { TravelTimeResolverService, isPeakHourUtc, type TravelTimeEdgeContext } from './travel-time-resolver.service';
import {
  EvidenceInvalidationReason,
  EvidenceLineageDto,
  EvidenceLineageSourceType,
  EvidenceReliability,
  PublicTransportEvidenceLineageDto,
  TravelTimeEvidenceLineageDto,
} from '../dto/evidence-lineage.dto';
import { applyNegotiationRegretFromRollbackHistory } from '../utils/negotiation-regret.application';
import {
  computePostponeTimelineFragility,
  reliabilityScoreFromMinBuffer,
} from '../utils/timeline-fragility.util';
import { NEGOTIATION_REASONING_TAG } from '../constants/negotiation-reasoning.constants';
import { ItineraryRevisionRegretService } from './itinerary-revision-regret.service';
import { UserPreferenceLearningService } from './user-preference-learning.service';
import { NegotiationNarratorService } from './negotiation-narrator.service';
import { buildStrategyImpactMap } from '../utils/strategy-impact-map.util';

function pushNegotiationReasoningTag(alt: any, tag: string) {
  const cur = Array.isArray(alt?.reasoning_tags) ? [...alt.reasoning_tags] : [];
  if (!cur.includes(tag)) cur.push(tag);
  alt.reasoning_tags = cur.sort();
}

function itineraryHasMode(itinerary: Itinerary | undefined, mode: string): boolean {
  if (!itinerary) return false;
  const m = mode.toUpperCase();
  return (itinerary.days ?? [])
    .flatMap((d: any) => (Array.isArray(d?.items) ? d.items : []))
    .some((it: any) => String(it?.type ?? '').toUpperCase() === m);
}

function getPrefetchedEvidence(params: any): any[] {
  const pe =
    params?.state?.research_data?.world?.physical?.prefetched_evidence ??
    params?.state?.research_data?.worldModel?.physical?.prefetched_evidence ??
    params?.state?.research_data?.world_build_context?.world?.physical?.prefetched_evidence ??
    [];
  return Array.isArray(pe) ? pe : [];
}

function findDriveQuoteUsd(prefetchedEvidence: any[]): number | undefined {
  for (const ev of prefetchedEvidence) {
    if (!ev || typeof ev !== 'object') continue;
    const ruleId = String((ev as any)?.rule_id ?? '');
    const type = String((ev as any)?.type ?? '');
    if (ruleId === 'drive_quote_v1' || type === 'pricing_quote') {
      const q = Number((ev as any)?.quote_usd);
      if (Number.isFinite(q)) return q;
    }
  }
  return undefined;
}

function findPtDelayMinutes(prefetchedEvidence: any[], decisionLog: DecisionLogEntry[] | undefined): number | undefined {
  const evs: any[] = [
    ...(Array.isArray(prefetchedEvidence) ? prefetchedEvidence : []),
    ...((Array.isArray(decisionLog) ? decisionLog.map((l: any) => l?.metadata?.details?.evidence).filter(Boolean) : []) as any[]),
  ];
  for (const ev of evs) {
    if (!ev || typeof ev !== 'object') continue;
    const ruleId = String((ev as any)?.rule_id ?? '');
    const type = String((ev as any)?.type ?? '');
    if (ruleId !== 'public_transport_v1' && type !== 'public_transit') continue;
    const req = Number((ev as any)?.transferWindowMin ?? (ev as any)?.transferWindow ?? (ev as any)?.transfer_window_min);
    const planned = Number((ev as any)?.plannedTransferWindowMin ?? (ev as any)?.planned_transfer_window_min);
    const nextOffset = Number((ev as any)?.nextAvailableTripOffsetMin ?? (ev as any)?.next_available_trip_offset_min ?? 0);
    if (!Number.isFinite(req) || !Number.isFinite(planned)) continue;
    const gap = Math.max(0, req - planned);
    const off = Number.isFinite(nextOffset) ? Math.max(0, nextOffset) : 0;
    const delay = gap + off;
    if (delay > 0) return delay;
  }
  return undefined;
}

function findPtLineage(prefetchedEvidence: any[], decisionLog: DecisionLogEntry[] | undefined): PublicTransportEvidenceLineageDto | undefined {
  const evs: any[] = [
    ...(Array.isArray(prefetchedEvidence) ? prefetchedEvidence : []),
    ...((Array.isArray(decisionLog) ? decisionLog.map((l: any) => l?.metadata?.details?.evidence).filter(Boolean) : []) as any[]),
  ];
  for (const ev of evs) {
    if (!ev || typeof ev !== 'object') continue;
    const ruleId = String((ev as any)?.rule_id ?? '');
    const type = String((ev as any)?.type ?? '');
    if (ruleId !== 'public_transport_v1' && type !== 'public_transit') continue;

    const status = String((ev as any)?.serviceStatus ?? (ev as any)?.boardingStatus ?? 'UNKNOWN').toUpperCase();
    const delayMin = findPtDelayMinutes([ev], undefined);
    const delaySeconds = typeof delayMin === 'number' && Number.isFinite(delayMin) ? Math.max(0, Math.round(delayMin * 60)) : undefined;
    const snapId =
      (ev as any)?.snapshot_id ??
      (ev as any)?.provider_reference?.reference_id ??
      (ev as any)?.provider_reference?.id ??
      null;
    const source = String((ev as any)?.source ?? '');
    const hasProviderRef = Boolean((ev as any)?.provider_reference) || Boolean((ev as any)?.snapshot_id);
    const fromRealtime = source.startsWith('GTFS_REALTIME:') || source.includes('GTFS_REALTIME') || hasProviderRef;

    const reliability =
      status === 'CANCELLED' || status === 'CANCELED' || (typeof delaySeconds === 'number' && delaySeconds > 0)
        ? EvidenceReliability.VOLATILE
        : EvidenceReliability.STABLE;

    return {
      reliability,
      source_type: fromRealtime ? EvidenceLineageSourceType.L2_REALTIME_COMPUTED : EvidenceLineageSourceType.L1_CACHE_HIT,
      captured_context: {
        trip_status: status || 'UNKNOWN',
        ...(typeof delaySeconds === 'number' ? { delay_seconds: delaySeconds } : {}),
        ...(snapId ? { gtfs_snapshot_id: String(snapId) } : {}),
      },
    } as PublicTransportEvidenceLineageDto;
  }
  return undefined;
}

function findCachedTravelMinutes(prefetchedEvidence: any[], cur: any, next: any): number | undefined {
  const mode = 'DRIVE'; // v0: only used for "upgrade to drive" negotiation & slack; can be generalized later
  const coords = (it: any) => {
    const c =
      it?.location_ref?.coordinates ??
      it?.location_ref?.coord ??
      it?.metadata?.coordinates ??
      it?.metadata?.coord ??
      null;
    const lat = Number(c?.lat);
    const lng = Number(c?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat: Number(lat.toFixed(2)), lng: Number(lng.toFixed(2)) };
  };
  const a = coords(cur);
  const b = coords(next);
  if (!a || !b) return undefined;

  for (const ev of Array.isArray(prefetchedEvidence) ? prefetchedEvidence : []) {
    if (!ev || typeof ev !== 'object') continue;
    const ruleId = String((ev as any)?.rule_id ?? '');
    const type = String((ev as any)?.type ?? '');
    if (ruleId !== 'travel_time_v1' && type !== 'travel_time') continue;
    const m = String((ev as any)?.mode ?? '').toUpperCase();
    if (m && m !== mode) continue;
    const from = (ev as any)?.from;
    const to = (ev as any)?.to;
    const f = { lat: Number(from?.lat), lng: Number(from?.lng) };
    const t = { lat: Number(to?.lat), lng: Number(to?.lng) };
    if (![f.lat, f.lng, t.lat, t.lng].every((x) => Number.isFinite(x))) continue;
    const f2 = { lat: Number(f.lat.toFixed(2)), lng: Number(f.lng.toFixed(2)) };
    const t2 = { lat: Number(t.lat.toFixed(2)), lng: Number(t.lng.toFixed(2)) };
    if (f2.lat === a.lat && f2.lng === a.lng && t2.lat === b.lat && t2.lng === b.lng) {
      const minutes = Number((ev as any)?.travel_minutes);
      if (Number.isFinite(minutes) && minutes >= 0) return minutes;
    }
  }
  return undefined;
}

export function detectCriticalBookingCollision(itinerary: Itinerary | undefined): { conflicts: any[] } | undefined {
  if (!itinerary) return undefined;
  const items: any[] = (itinerary.days ?? []).flatMap((d: any) => (Array.isArray(d?.items) ? d.items : []));
  const conflicts: any[] = [];
  for (const it of items) {
    if (!it || typeof it !== 'object') continue;
    const isHard = Boolean(it?.metadata?.hard_booking) === true || String(it?.type ?? '').toUpperCase() === 'HARD_BOOKING';
    if (!isHard) continue;
    const startIso = it?.start_time ?? it?.startTime;
    const startMs = typeof startIso === 'string' ? Date.parse(startIso) : NaN;
    if (!Number.isFinite(startMs)) continue;
    const latestIso = it?.metadata?.latest_arrival_time ?? it?.metadata?.latestArrivalTime ?? it?.latest_arrival_time;
    const latestMs = typeof latestIso === 'string' ? Date.parse(latestIso) : NaN;
    if (!Number.isFinite(latestMs)) continue;
    const graceMinRaw = it?.metadata?.grace_minutes ?? it?.metadata?.graceMinutes ?? 0;
    const graceMin = Number.isFinite(Number(graceMinRaw)) ? Math.max(0, Number(graceMinRaw)) : 0;
    const latestWithGrace = latestMs + graceMin * 60_000;
    if (startMs > latestWithGrace) {
      conflicts.push({
        severity: 'CRITICAL_CONFLICT',
        reason_code: 'HEAL_IMPACT_BOOKING_COLLISION',
        item_id: it?.id ?? it?.item_id ?? null,
        latest_arrival_time: latestIso,
        grace_minutes: graceMin,
        scheduled_start_time: startIso,
      });
    }
  }
  return conflicts.length ? { conflicts } : undefined;
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function detectTravelImpossibility(itinerary: Itinerary | undefined): { conflicts: any[] } | undefined {
  if (!itinerary) return undefined;
  const items: any[] = (itinerary.days ?? []).flatMap((d: any) => (Array.isArray(d?.items) ? d.items : []));
  const withStart = items
    .map((it) => ({ it, t: typeof it?.start_time === 'string' ? Date.parse(it.start_time) : NaN }))
    .filter((x) => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t);

  const coords = (it: any) => {
    const c = it?.location_ref?.coordinates ?? it?.metadata?.coordinates ?? null;
    const lat = Number(c?.lat);
    const lng = Number(c?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  };
  const endMs = (it: any): number | undefined => {
    const et = typeof it?.end_time === 'string' ? Date.parse(it.end_time) : NaN;
    if (Number.isFinite(et)) return et;
    const st = typeof it?.start_time === 'string' ? Date.parse(it.start_time) : NaN;
    const dur = Number(it?.min_duration_minutes ?? it?.metadata?.min_duration_minutes ?? NaN);
    if (Number.isFinite(st) && Number.isFinite(dur)) return st + Math.max(0, dur) * 60_000;
    return undefined;
  };

  const SPEED_KMH = 30;
  const conflicts: any[] = [];
  for (let i = 0; i < withStart.length - 1; i++) {
    const cur = withStart[i].it;
    const next = withStart[i + 1].it;
    const curEnd = endMs(cur);
    const nextStart = withStart[i + 1].t;
    if (!Number.isFinite(nextStart) || typeof curEnd !== 'number' || !Number.isFinite(curEnd)) continue;
    const a = coords(cur);
    const b = coords(next);
    const travelMin =
      a && b
        ? Math.max(0, Math.ceil((haversineKm(a, b) / SPEED_KMH) * 60))
        : 0;
    if (curEnd + travelMin * 60_000 > nextStart) {
      conflicts.push({
        severity: 'CRITICAL_CONFLICT',
        reason_code: 'HEAL_IMPACT_TRAVEL_IMPOSSIBLE',
        from_item_id: cur?.id ?? null,
        to_item_id: next?.id ?? null,
        from_end_time: cur?.end_time ?? null,
        to_start_time: next?.start_time ?? null,
        travel_minutes_min: travelMin,
      });
    }
  }
  return conflicts.length ? { conflicts } : undefined;
}

async function projectImpact(
  itinerary: Itinerary | undefined,
  etaDelayMinutes: number,
  prefetchedEvidenceForTravel: any[],
  resolveTravelMinutesOverride?: (cur: any, next: any) => Promise<number | undefined>,
): Promise<{ reason_code: string; conflicts: any[] } | undefined> {
  if (!itinerary || !Number.isFinite(etaDelayMinutes) || etaDelayMinutes <= 0) return undefined;

  const MIN_SURVIVAL_BUFFER_MIN = 5;
  const DEFAULT_SPEED_KMH = 30; // conservative intra-city transfer speed (no external IO)
  const items: any[] = (itinerary.days ?? []).flatMap((d: any) => (Array.isArray(d?.items) ? d.items : []));
  const withTimes = items
    .map((it) => {
      const startIso = it?.start_time ?? it?.startTime;
      const t = typeof startIso === 'string' ? Date.parse(startIso) : NaN;
      return { it, t };
    })
    .filter((x) => Number.isFinite(x.t))
    .sort((a, b) => a.t - b.t);

  const planned = withTimes.filter((x) => String(x.it?.status ?? 'PLANNED').toUpperCase() === 'PLANNED');
  const bookings = planned.filter((x) => Boolean(x.it?.metadata?.hard_booking));
  if (planned.length === 0 || bookings.length === 0) return undefined;

  const conflicts: any[] = [];
  let rollingDelayMin = etaDelayMinutes;

  const resolveEndMs = (it: any, startMs: number): number => {
    const endIso = it?.end_time ?? it?.endTime;
    const end = typeof endIso === 'string' ? Date.parse(endIso) : NaN;
    if (Number.isFinite(end)) return end;
    const minDurMin = Number(it?.min_duration_minutes ?? it?.metadata?.min_duration_minutes ?? 0);
    const dur = Number.isFinite(minDurMin) ? Math.max(0, minDurMin) : 0;
    return startMs + dur * 60_000;
  };

  const toRad = (x: number) => (x * Math.PI) / 180;
  const haversineKm = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
    const R = 6371;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const sa = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(sa)));
  };
  const extractCoords = (it: any): { lat: number; lng: number } | null => {
    const c =
      it?.location_ref?.coordinates ??
      it?.location_ref?.coord ??
      it?.metadata?.coordinates ??
      it?.metadata?.coord ??
      null;
    const lat = Number(c?.lat);
    const lng = Number(c?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    return { lat, lng };
  };
  const resolveTravelMinutes = (cur: any, next: any): number => {
    // Hook: in future, subtract estimated travel time (router/time-matrix) to compute true slack.
    // v0: compute from coordinates only (no external IO).
    const a = extractCoords(cur);
    const b = extractCoords(next);
    if (!a || !b) return 0;
    const km = haversineKm(a, b);
    const min = (km / DEFAULT_SPEED_KMH) * 60;
    // clamp to avoid pathological coords blowing up
    if (!Number.isFinite(min)) return 0;
    return Math.max(0, Math.min(240, Math.round(min)));
  };

  for (let idx = 0; idx < planned.length; idx++) {
    const p = planned[idx];
    const minDurMin = Number(p.it?.min_duration_minutes ?? p.it?.metadata?.min_duration_minutes ?? 0);
    const dur = Number.isFinite(minDurMin) ? minDurMin : 0;
    const _etaForNonBooking = p.t + (dur + rollingDelayMin) * 60_000;

    // Only assess booking nodes.
    if (Boolean(p.it?.metadata?.hard_booking)) {
      // For bookings, "arrival" is the shifted start time (not including the booking duration).
      const eta = p.t + rollingDelayMin * 60_000;
      const latestIso =
        p.it?.metadata?.latest_arrival_time ??
        p.it?.metadata?.latest_arrival_time_iso ??
        p.it?.metadata?.booking_window_end_iso ??
        p.it?.start_time ??
        p.it?.startTime;
      const latest = typeof latestIso === 'string' ? Date.parse(latestIso) : p.t;
      const graceMinRaw = Number(p.it?.metadata?.grace_minutes ?? p.it?.metadata?.grace_min ?? 0);
      const graceMin = Number.isFinite(graceMinRaw) ? Math.max(0, graceMinRaw) : 0;
      const latestWithGrace = latest + graceMin * 60_000;

      if (Number.isFinite(latest) && eta > latest) {
        const severity = eta > latestWithGrace ? 'CRITICAL_CONFLICT' : 'WARNING_CONFLICT';
        conflicts.push({
          severity,
          context: {
            station: String(p.it?.location_ref?.name ?? p.it?.location_ref?.place_id ?? 'unknown'),
            booking_time: new Date(latest).toISOString(),
            estimated_arrival: new Date(eta).toISOString(),
            rolling_delay_minutes: rollingDelayMin,
            grace_minutes: graceMin,
          },
          message:
            severity === 'CRITICAL_CONFLICT'
              ? `预计到达时间 ${new Date(eta).toISOString()} 将超过预约最晚到达 ${new Date(latest).toISOString()}，预约可能失效。`
              : `预计将迟到约 ${Math.round((eta - latest) / 60_000)} 分钟，可能超过保留时间。`,
        });
      }
    }

    // Autonomous slack discovery (schedule gap):
    // effective_buffer = max(0, next.start - cur.end - travel_minutes - MIN_SURVIVAL_BUFFER_MIN)
    const next = idx + 1 < planned.length ? planned[idx + 1] : null;
    if (next) {
      const curEndMs = resolveEndMs(p.it, p.t);
      const nextStartMs = next.t;
      const gapMin = Math.max(0, (nextStartMs - curEndMs) / 60_000);
      const fromOverride = resolveTravelMinutesOverride ? await resolveTravelMinutesOverride(p.it, next.it) : undefined;
      const travelMin =
        fromOverride ??
        findCachedTravelMinutes(prefetchedEvidenceForTravel, p.it, next.it) ??
        resolveTravelMinutes(p.it, next.it);
      const effectiveBuffer = Math.max(0, gapMin - travelMin - MIN_SURVIVAL_BUFFER_MIN);
      rollingDelayMin = Math.max(0, rollingDelayMin - effectiveBuffer);
    }
  }

  return conflicts.length ? { reason_code: 'HEAL_IMPACT_BOOKING_COLLISION', conflicts } : undefined;
}

function extractFailureReasonCodesFromDecisionLog(decisionLog: DecisionLogEntry[] | undefined): string[] {
  if (!Array.isArray(decisionLog)) return [];
  const out: string[] = [];
  for (const l of decisionLog) {
    const codes = (l as any)?.metadata?.details?.evidence_bundle?.failure_reason_codes;
    if (Array.isArray(codes)) out.push(...codes.map((x) => String(x)));
    const codes2 = (l as any)?.metadata?.details?.failure_reason_codes;
    if (Array.isArray(codes2)) out.push(...codes2.map((x) => String(x)));

    // Fallback inference (deterministic): derive key failure codes from hard-rule evidence in logs.
    const ruleId = String((l as any)?.metadata?.rule_id ?? '');
    const ev = (l as any)?.metadata?.details?.evidence;
    if (ruleId === 'public_transport_v1' || ruleId === 'public_transport_v1'.replace('_v1', '_v1')) {
      const st = String(ev?.serviceStatus ?? ev?.boardingStatus ?? '').toUpperCase();
      if (st === 'CANCELLED' || st === 'CANCELED') out.push('PT_CANCELLED');
      const req = ev?.transferWindowMin ?? ev?.transferWindow ?? ev?.transfer_window_min;
      const planned = ev?.plannedTransferWindowMin ?? ev?.planned_transfer_window_min;
      if (typeof req === 'number' && typeof planned === 'number' && planned < req) out.push('PT_TRANSFER_GAP_VIOLATION');
    }
  }
  return Array.from(new Set(out)).filter(Boolean).sort();
}

@Injectable()
export class TradeoffEngineService {
  constructor(
    @Optional() private readonly evidenceCache?: EvidenceCacheService,
    @Optional() private readonly router?: TravelTimeRouterService,
    @Optional() private readonly accessTracker?: AccessTrackerService,
    @Optional() private readonly travelTimeResolver?: TravelTimeResolverService,
    @Optional()
    @Inject(ItineraryRevisionRegretService)
    private readonly itineraryRevisionRegret?: ItineraryRevisionRegretService,
    @Optional()
    @Inject(UserPreferenceLearningService)
    private readonly userPreferenceLearning?: UserPreferenceLearningService,
    @Optional()
    @Inject(NegotiationNarratorService)
    private readonly negotiationNarrator?: NegotiationNarratorService,
  ) {}

  private getTravelTimeResolver(): TravelTimeResolverService {
    return this.travelTimeResolver ?? new TravelTimeResolverService(this.evidenceCache, this.router, this.accessTracker);
  }
  /**
   * Minimal negotiation trigger:
   * - only runs when caller provided preference_profile
   * - uses hard-fact-derived failure_reason_codes + final itinerary mode shifts
   * - outputs a deterministic, auditable negotiation payload
   */
  async buildNegotiation(params: {
    request: RouteAndRunRequestDto;
    decisionLog?: DecisionLogEntry[];
    finalItinerary?: Itinerary;
    state?: any;
  }): Promise<NegotiationPayloadDto | undefined> {
    const pref = (params.request as any).preference_profile ?? ({} as any);

    const failureCodes = extractFailureReasonCodesFromDecisionLog(params.decisionLog);
    const reasonCode = String(params.request.emergency_constraints?.reason_code ?? '').toUpperCase();
    const ptPairPresent = Boolean((params.request.emergency_constraints as any)?.pt_station_pair);
    const hasPtTransferGap =
      failureCodes.includes('PT_TRANSFER_GAP_VIOLATION') ||
      failureCodes.includes('PT_CANCELLED') ||
      reasonCode.includes('HEALING_PT_HARD_FACT_FAILED') ||
      ptPairPresent;
    if (!hasPtTransferGap) return undefined;

    const resolvedItinerary: Itinerary | undefined =
      params.finalItinerary ??
      (params.state?.itinerary as Itinerary | undefined) ??
      (params.state?.result?.itinerary as Itinerary | undefined) ??
      (params.state?.state?.itinerary as Itinerary | undefined);
    // v0 trigger: once PT hard-fact failure requires fallback, negotiation is valid even if the final itinerary
    // is not yet materialized as DRIVE in the response shape.
    const _finalHasDrive = itineraryHasMode(resolvedItinerary, 'DRIVE');

    const prefetched = getPrefetchedEvidence(params);
    const quoted = findDriveQuoteUsd(prefetched);
    const cost_delta_drive = typeof quoted === 'number' && Number.isFinite(quoted) ? quoted : 50;
    const derivedDelay = findPtDelayMinutes(prefetched, params.decisionLog);
    const time_delta_wait = typeof derivedDelay === 'number' && Number.isFinite(derivedDelay) && derivedDelay > 0 ? derivedDelay : 30;

    const maxExtraRaw = (pref as any).max_extra_cost_usd;
    const maxDelayRaw = (pref as any).max_delay_minutes;
    const maxExtraParsed = Number.isFinite(Number(maxExtraRaw)) ? Number(maxExtraRaw) : undefined;
    const maxDelayParsed = Number.isFinite(Number(maxDelayRaw)) ? Number(maxDelayRaw) : undefined;
    // If preference_profile is present but values were stripped/omitted, default to 0 to force explicit confirmation.
    const maxExtra = maxExtraParsed ?? 0;
    const maxDelay = maxDelayParsed ?? 0;

    // If either option violates user's stated limits, force explicit confirmation.
    const driveTooExpensive = cost_delta_drive > maxExtra;
    const waitTooSlow = time_delta_wait > maxDelay;

    if (!(driveTooExpensive || waitTooSlow)) {
      // Within limits: still no negotiation needed (auto accept).
      return undefined;
    }

    const impact =
      failureCodes.includes('PT_TRANSFER_GAP_VIOLATION')
        ? '您在换乘点的换乘时间不足，极大概率错过班次。'
        : '公共交通班次状态异常（取消/不可用），需要调整方案。';

    let default_option_id = driveTooExpensive ? 'POSTPONE_SCHEDULE' : 'UPGRADE_TO_DRIVE';
    const constraints_hash = this.evidenceCache?.hashEmergencyConstraints(params.request.emergency_constraints ?? null);
    const nowMs = Date.now();

    const lineageDto = new EvidenceLineageDto();
    const ptLineage = findPtLineage(prefetched, params.decisionLog);
    if (ptLineage) {
      lineageDto.public_transport_v1 = ptLineage;
    }

    const memo = new Map<string, { minutes: number; lineage: TravelTimeEvidenceLineageDto }>();
    const peakNow = isPeakHourUtc(nowMs);
    const travelCtx: TravelTimeEdgeContext = {
      nowMs,
      constraints_hash,
      prefetchedEvidence: prefetched,
      memo,
    };
    const resolver = this.getTravelTimeResolver();
    const resolveFromCacheOrRouter = async (cur: any, next: any): Promise<number | undefined> => {
      const r = await resolver.getMinTravelMinutes(cur, next, travelCtx);
      if (!r) return undefined;
      lineageDto.travel_time_v1 = r.lineage;
      return r.minutes;
    };

    const impact_assessment = await projectImpact(resolvedItinerary, time_delta_wait, prefetched, resolveFromCacheOrRouter);
    const lineage_summary =
      peakNow && lineageDto.travel_time_v1
        ? '高峰时段：已主动降权邻域缓存并触发实时重测（DRIVE 路况波动）'
        : undefined;

    if (lineageDto.travel_time_v1?.reliability === EvidenceReliability.VOLATILE && !lineageDto.travel_time_v1?.invalidation_reason) {
      // strict semantic check (protocol rigidity)
      throw new Error('EvidenceLineageProtocol: VOLATILE travel_time_v1 must include invalidation_reason');
    }
    const lineageErrors = validateSync(lineageDto as any, { whitelist: false, forbidUnknownValues: false });
    if (lineageErrors.length) {
      throw new Error(`EvidenceLineageProtocol: invalid DTO (${lineageErrors[0]?.property ?? 'unknown'})`);
    }

    const sessionId = `neg:${String((params.request as any)?.request_id ?? 'unknown')}`;
    const altUpgrade = {
      id: 'UPGRADE_TO_DRIVE',
      cost_delta_usd: cost_delta_drive,
      time_delta_minutes: 0,
      effort_delta: 0.1,
      message: `多花 $${cost_delta_drive}，但能保住关键预约。`,
      consequence: '预计准时到达，不影响后续硬预约节点。',
    };
    const altPostpone = {
      id: 'POSTPONE_SCHEDULE',
      cost_delta_usd: 0,
      time_delta_minutes: time_delta_wait,
      effort_delta: 0.0,
      message: `节省费用，但整体推迟 ${time_delta_wait} 分钟。`,
      consequence: impact_assessment?.conflicts?.length
        ? '将导致至少一个硬预约冲突（预约失效风险）。'
        : '可能压缩后续行程缓冲。',
    };

    const fragilityArgs = {
      itinerary: resolvedItinerary,
      prefetchedEvidence: prefetched,
      resolveTravelMinutes: resolveFromCacheOrRouter,
      findCachedTravelMinutes: (cur: any, next: any) => findCachedTravelMinutes(prefetched, cur, next),
    };
    const [fragility, fragilityBaseline] = await Promise.all([
      computePostponeTimelineFragility({
        ...fragilityArgs,
        postponeMinutes: time_delta_wait,
      }),
      computePostponeTimelineFragility({
        ...fragilityArgs,
        postponeMinutes: 0,
      }),
    ]);

    let postponeFragilityRegretLine = '';
    if (fragility?.is_fragile) {
      (altPostpone as any).is_fragile = true;
      (altPostpone as any).risk_level = fragility.risk_level;
      postponeFragilityRegretLine = '此方案准点压力较大';
      pushNegotiationReasoningTag(altPostpone, NEGOTIATION_REASONING_TAG.REAL_TIME_RISK_WARNING);
      const baseEff = Number((altPostpone as any).effort_delta ?? 0);
      const fragPenalty = fragility.risk_level === 'HIGH' ? 0.25 : fragility.risk_level === 'MEDIUM' ? 0.12 : 0;
      (altPostpone as any).effort_delta = baseEff + fragPenalty;
    }
    const rsPostpone = reliabilityScoreFromMinBuffer(fragility?.min_buffer_minutes ?? null);
    if (rsPostpone != null) (altPostpone as any).reliability_score = rsPostpone;
    const rsUpgrade = reliabilityScoreFromMinBuffer(fragilityBaseline?.min_buffer_minutes ?? null);
    if (rsUpgrade != null) (altUpgrade as any).reliability_score = rsUpgrade;

    const userId = (params.request as any)?.user_id as string | undefined;
    const biasUp = (await this.userPreferenceLearning?.getRollbackBiasEffortDelta(userId, 'UPGRADE_TO_DRIVE')) ?? 0;
    const biasPo = (await this.userPreferenceLearning?.getRollbackBiasEffortDelta(userId, 'POSTPONE_SCHEDULE')) ?? 0;
    if (biasUp > 0) {
      (altUpgrade as any).effort_delta = Number((altUpgrade as any).effort_delta ?? 0) + biasUp;
      pushNegotiationReasoningTag(altUpgrade, NEGOTIATION_REASONING_TAG.TAILORED_TO_YOUR_PREFERENCE);
    }
    if (biasPo > 0) {
      (altPostpone as any).effort_delta = Number((altPostpone as any).effort_delta ?? 0) + biasPo;
      pushNegotiationReasoningTag(altPostpone, NEGOTIATION_REASONING_TAG.TAILORED_TO_YOUR_PREFERENCE);
    }

    let alternativesOrdered = [altUpgrade, altPostpone];
    const tripId = (params.request as any)?.trip_id as string | undefined;
    const regretApplied = await applyNegotiationRegretFromRollbackHistory({
      tripId,
      regret: this.itineraryRevisionRegret,
      alternatives: alternativesOrdered,
      default_option_id,
      driveTooExpensive,
    });
    alternativesOrdered = regretApplied.alternatives;
    default_option_id = regretApplied.default_option_id;

    if (postponeFragilityRegretLine) {
      alternativesOrdered = alternativesOrdered.map((a) => {
        if (String(a?.id ?? '') !== 'POSTPONE_SCHEDULE') return a;
        const existing = String((a as any)?.regret_notice ?? '').trim();
        const merged = [existing, postponeFragilityRegretLine].filter(Boolean).join(' ').trim();
        return { ...a, regret_notice: merged || postponeFragilityRegretLine };
      });
    }

    const hashPayload = {
      v: 1,
      session_id: sessionId,
      reason: impact_assessment?.reason_code ?? 'PT_DELAY_IMPACTING_BOOKING',
      alternatives: alternativesOrdered.map((a) => ({
        id: a.id,
        cost_delta_usd: a.cost_delta_usd,
        time_delta_minutes: a.time_delta_minutes,
      })),
      evidence_lineage: lineageDto,
      itinerary_modes: resolvedItinerary ? (resolvedItinerary.days ?? []).flatMap((d: any) => (d?.items ?? []).map((x: any) => String(x?.type ?? ''))) : [],
    };
    const expectedHash = `sha256:${createHash('sha256').update(JSON.stringify(hashPayload)).digest('hex')}`;

    const negotiationPayloadStub: any = {
      alternatives: alternativesOrdered,
      evidence_lineage: lineageDto,
    };
    const strategy_impact_map = await buildStrategyImpactMap({
      baselineItinerary: resolvedItinerary,
      alternatives: alternativesOrdered,
      negotiation_session_id: sessionId,
      negotiation_payload: negotiationPayloadStub,
      prefetchedEvidence: prefetched,
      resolveTravelMinutes: resolveFromCacheOrRouter,
      findCachedTravelMinutes: (cur: any, next: any) => findCachedTravelMinutes(prefetched, cur, next),
    });

    const recommendation_summary = this.negotiationNarrator?.summarize({
      alternatives: alternativesOrdered,
      strategy_impact_map,
    });

    return {
      status: 'PENDING_USER_DECISION',
      reason: impact_assessment?.reason_code ?? 'PT_DELAY_IMPACTING_BOOKING',
      impact:
        peakNow &&
        (lineageDto.travel_time_v1?.invalidation_reason === EvidenceInvalidationReason.EXPIRED_TRUST_NEIGHBORHOOD ||
          lineageDto.travel_time_v1?.source_type === EvidenceLineageSourceType.L2_REALTIME_COMPUTED)
          ? `${impact ?? ''}（高峰时段：已主动降权邻域缓存并触发实时重测）`
          : impact,
      alternatives: alternativesOrdered,
      default_option_id,
      negotiation_session_id: sessionId,
      expected_negotiation_hash: expectedHash,
      ...(recommendation_summary ? { recommendation_summary } : {}),
      ...(strategy_impact_map ? { strategy_impact_map } : {}),
      ...(impact_assessment ? { impact_assessment } : {}),
      ...(lineageDto.travel_time_v1 || lineageDto.public_transport_v1 ? { evidence_lineage: lineageDto } : {}),
      ...(lineage_summary ? { lineage_summary } : {}),
    };
  }
}

