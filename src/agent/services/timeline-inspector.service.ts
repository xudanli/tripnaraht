import { Injectable } from '@nestjs/common';
import type { Itinerary } from '../interfaces/trip-plan.interface';
import type { TravelTimeEvidenceLineageDto } from '../dto/evidence-lineage.dto';
import { EvidenceLineageSourceType } from '../dto/evidence-lineage.dto';

export type TimelineConflict = {
  severity: 'CRITICAL_CONFLICT' | 'WARNING_CONFLICT';
  reason_code: 'HEAL_IMPACT_TRAVEL_IMPOSSIBLE' | 'HEAL_IMPACT_BOOKING_COLLISION';
  item_id?: string | null;
  from_item_id?: string | null;
  to_item_id?: string | null;
  scheduled_start_time?: string | null;
  latest_arrival_time?: string | null;
  grace_minutes?: number;
  travel_minutes_min?: number;
  /** Travel-time provenance for HEAL_IMPACT_TRAVEL_IMPOSSIBLE (same shape as negotiation evidence lineage). */
  source_lineage?: TravelTimeEvidenceLineageDto;
  /** Human-readable attribution for 409 timeline_impact. */
  lineage_summary?: string;
};

export type TravelTimeResolveResult = {
  minutes: number;
  source_lineage?: TravelTimeEvidenceLineageDto;
};

export type TravelTimeResolver = (cur: any, next: any) => Promise<TravelTimeResolveResult | number | undefined>;

export function summarizeTravelImpossibleLineage(lineage: TravelTimeEvidenceLineageDto | undefined, travelMinutesMin: number): string | undefined {
  if (!lineage) {
    return `系统估计至少需要约 ${travelMinutesMin} 分钟完成位移，当前排程空隙不足（无路况溯源）。`;
  }
  const m = Math.max(0, Math.round(travelMinutesMin));
  switch (lineage.source_type) {
    case EvidenceLineageSourceType.L3_FALLBACK:
      return `由于 [Haversine 物理下界] 判定两地至少需要约 ${m} 分钟位移，当前方案在时间上不可行。`;
    case EvidenceLineageSourceType.L2_REALTIME_COMPUTED:
      return `由于 [实时路况/路由重测] 显示路程约需 ${m} 分钟，当前空隙在物理上不可行。`;
    case EvidenceLineageSourceType.L1_CACHE_HIT:
      return `由于 [本小时桶路况缓存] 显示路程约需 ${m} 分钟，当前方案在物理上不可行。`;
    case EvidenceLineageSourceType.L1B_NEIGHBOR_HIT: {
      const mb = lineage.matched_bucket ? `（复用桶 ${lineage.matched_bucket}）` : '';
      return `由于 [邻域时间桶路况缓存${mb}] 显示路程约需 ${m} 分钟，当前方案在物理上不可行。`;
    }
    default:
      return `路况证据显示约需 ${m} 分钟，当前排程空隙不足。`;
  }
}

@Injectable()
export class TimelineInspectorService {
  async inspect(params: {
    itinerary: Itinerary | undefined;
    travelTimeResolver: TravelTimeResolver;
  }): Promise<{ conflicts: TimelineConflict[] }> {
    const itinerary = params.itinerary;
    if (!itinerary) return { conflicts: [] };

    const items: any[] = (itinerary.days ?? []).flatMap((d: any) => (Array.isArray(d?.items) ? d.items : []));

    const conflicts: TimelineConflict[] = [];

    // (1) Hard booking collision: start_time > latest_arrival_time (+grace)
    for (const it of items) {
      const isHard = Boolean(it?.metadata?.hard_booking) === true || String(it?.type ?? '').toUpperCase() === 'HARD_BOOKING';
      if (!isHard) continue;
      const startIso = it?.start_time ?? it?.startTime;
      const startMs = typeof startIso === 'string' ? Date.parse(startIso) : NaN;
      const latestIso = it?.metadata?.latest_arrival_time ?? it?.metadata?.latestArrivalTime ?? it?.latest_arrival_time;
      const latestMs = typeof latestIso === 'string' ? Date.parse(latestIso) : NaN;
      if (!Number.isFinite(startMs) || !Number.isFinite(latestMs)) continue;
      const graceMinRaw = it?.metadata?.grace_minutes ?? it?.metadata?.graceMinutes ?? 0;
      const graceMin = Number.isFinite(Number(graceMinRaw)) ? Math.max(0, Number(graceMinRaw)) : 0;
      if (startMs > latestMs + graceMin * 60_000) {
        conflicts.push({
          severity: 'CRITICAL_CONFLICT',
          reason_code: 'HEAL_IMPACT_BOOKING_COLLISION',
          item_id: it?.id ?? it?.item_id ?? null,
          scheduled_start_time: startIso ?? null,
          latest_arrival_time: latestIso ?? null,
          grace_minutes: graceMin,
        });
      }
    }

    // (2) Spatio-temporal continuity: end(cur)+travelMin > start(next)
    const withStart = items
      .map((it) => ({ it, t: typeof it?.start_time === 'string' ? Date.parse(it.start_time) : NaN }))
      .filter((x) => Number.isFinite(x.t))
      .sort((a, b) => a.t - b.t);

    const endMs = (it: any): number | undefined => {
      const et = typeof it?.end_time === 'string' ? Date.parse(it.end_time) : NaN;
      if (Number.isFinite(et)) return et;
      const st = typeof it?.start_time === 'string' ? Date.parse(it.start_time) : NaN;
      const dur = Number(it?.min_duration_minutes ?? it?.metadata?.min_duration_minutes ?? NaN);
      if (Number.isFinite(st) && Number.isFinite(dur)) return st + Math.max(0, dur) * 60_000;
      return undefined;
    };

    for (let i = 0; i < withStart.length - 1; i++) {
      const cur = withStart[i].it;
      const next = withStart[i + 1].it;
      const curEnd = endMs(cur);
      const nextStart = withStart[i + 1].t;
      if (typeof curEnd !== 'number' || !Number.isFinite(curEnd) || !Number.isFinite(nextStart)) continue;
      const travelResolved = await params.travelTimeResolver(cur, next);
      const resolvedObj =
        travelResolved != null && typeof travelResolved === 'object' && 'minutes' in (travelResolved as any)
          ? (travelResolved as TravelTimeResolveResult)
          : undefined;
      const minRaw = resolvedObj ? resolvedObj.minutes : typeof travelResolved === 'number' ? travelResolved : 0;
      const min = Number.isFinite(Number(minRaw)) ? Math.max(0, Number(minRaw)) : 0;
      const source_lineage = resolvedObj?.source_lineage;
      if (curEnd + min * 60_000 > nextStart) {
        conflicts.push({
          severity: 'CRITICAL_CONFLICT',
          reason_code: 'HEAL_IMPACT_TRAVEL_IMPOSSIBLE',
          from_item_id: cur?.id ?? null,
          to_item_id: next?.id ?? null,
          travel_minutes_min: min,
          ...(source_lineage ? { source_lineage, lineage_summary: summarizeTravelImpossibleLineage(source_lineage, min) } : {}),
        });
      }
    }

    return { conflicts };
  }
}

