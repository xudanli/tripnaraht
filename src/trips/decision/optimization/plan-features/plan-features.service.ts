import { Injectable } from '@nestjs/common';
import type { RoutePlanDraft, RouteSegment } from '../../shared/world-model.types';

export interface PlanFeatures {
  daysCount: number;
  segmentsCount: number;
  avgSegmentsPerDay: number;
  maxSegmentsInADay: number;

  totalDistanceKm: number;
  totalAscentM: number;
  maxDailyDistanceKm: number;
  maxDailyAscentM: number;

  /** Rough proxy for schedule tightness when we lack real time windows. */
  slackTightness01: number;

  /** Smooth proxies for fatigue/effort. */
  effort01: number;

  /** Structural signature for diversity & diagnostics (stable-ish). */
  diversitySignature: string;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

@Injectable()
export class PlanFeaturesService {
  extract(plan: RoutePlanDraft): PlanFeatures {
    const segments = Array.isArray(plan?.segments) ? (plan.segments as RouteSegment[]) : [];
    const segmentsCount = segments.length;

    const daysCount =
      segmentsCount > 0 ? new Set(segments.map((s) => (s as { dayIndex?: number }).dayIndex ?? 0)).size : 0;

    const segsPerDay = new Map<number, RouteSegment[]>();
    for (const s of segments) {
      const d = (s as { dayIndex?: number }).dayIndex ?? 0;
      const list = segsPerDay.get(d) ?? [];
      list.push(s);
      segsPerDay.set(d, list);
    }

    let maxSegmentsInADay = 0;
    let maxDailyDistanceKm = 0;
    let maxDailyAscentM = 0;
    let totalDistanceKm = 0;
    let totalAscentM = 0;

    for (const [_day, list] of segsPerDay.entries()) {
      maxSegmentsInADay = Math.max(maxSegmentsInADay, list.length);
      const dayDist = list.reduce((sum, seg) => sum + (Number(seg.distanceKm) || 0), 0);
      const dayAsc = list.reduce((sum, seg) => sum + (Number(seg.ascentM) || 0), 0);
      maxDailyDistanceKm = Math.max(maxDailyDistanceKm, dayDist);
      maxDailyAscentM = Math.max(maxDailyAscentM, dayAsc);
      totalDistanceKm += dayDist;
      totalAscentM += dayAsc;
    }

    const avgSegmentsPerDay = daysCount > 0 ? segmentsCount / daysCount : 0;

    // Tightness proxy: more segments/day and higher max/day spikes => tighter schedule.
    const tightnessFromDensity = clamp01((avgSegmentsPerDay - 2) / 6); // 2..8 → 0..1
    const tightnessFromSpike = clamp01((maxSegmentsInADay - 3) / 7); // 3..10 → 0..1
    const slackTightness01 = clamp01(0.6 * tightnessFromDensity + 0.4 * tightnessFromSpike);

    // Effort proxy: ascent + distance, normalized to typical hiking-ish ranges.
    const effortFromAsc = clamp01(totalAscentM / 4000);
    const effortFromDist = clamp01(totalDistanceKm / 80);
    const effort01 = clamp01(0.65 * effortFromAsc + 0.35 * effortFromDist);

    const diversitySignature = this.buildDiversitySignature(plan, segments);

    return {
      daysCount,
      segmentsCount,
      avgSegmentsPerDay,
      maxSegmentsInADay,
      totalDistanceKm,
      totalAscentM,
      maxDailyDistanceKm,
      maxDailyAscentM,
      slackTightness01,
      effort01,
      diversitySignature,
    };
  }

  private buildDiversitySignature(plan: RoutePlanDraft, segments: RouteSegment[]): string {
    const rd = (plan as any)?.routeDirectionId ?? 'rd';
    const keys = segments.map((s) => {
      const day = (s as any)?.dayIndex ?? 0;
      const poi = (s as any)?.poiId ?? '';
      const segId = (s as any)?.segmentId ?? '';
      return `${day}:${poi || segId || 'seg'}`;
    });
    return `${String(rd)}|${keys.join('|')}`;
  }
}

