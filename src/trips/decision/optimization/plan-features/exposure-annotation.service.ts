import { Injectable } from '@nestjs/common';
import type { TripWorldState, ActivityCandidate } from '../../world-model';
import type { RoutePlanDraft, RouteSegment } from '../../shared/world-model.types';

/**
 * Exposure annotation v1 (fast path):
 * Enrich RoutePlanDraft segments metadata by joining poiId -> ActivityCandidate.
 *
 * This is intentionally schema-tolerant: we read from `candidate as any` metadata fields
 * because ActivityCandidate doesn't yet standardize road/hazard/elevation exposure fields.
 */
@Injectable()
export class ExposureAnnotationService {
  annotatePlan(
    plan: RoutePlanDraft,
    world: TripWorldState,
    dayIndexToDate?: Record<number, string>,
  ): RoutePlanDraft {
    const segs = Array.isArray(plan?.segments) ? (plan.segments as RouteSegment[]) : [];
    if (segs.length === 0) return plan;

    const lookupCandidate = (poiId: string, dayIndex: number): ActivityCandidate | undefined => {
      const date = dayIndexToDate?.[dayIndex];
      if (date && world.candidatesByDate?.[date]) {
        return world.candidatesByDate[date].find((c) => c.id === poiId);
      }
      // fallback: scan all dates (slower but safe for shifted dayIndex)
      for (const d of Object.keys(world.candidatesByDate ?? {})) {
        const c = world.candidatesByDate[d]?.find((x) => x.id === poiId);
        if (c) return c;
      }
      return undefined;
    };

    const rewritten = segs.map((s) => {
      const md = { ...((s as any).metadata ?? {}) };
      const poiId = String(md.poiId ?? md.poi_id ?? '');
      if (!poiId) return s;

      const cand = lookupCandidate(poiId, (s as any).dayIndex ?? 0);
      if (!cand) return s;

      const cAny = cand as any;
      const cMeta = cAny.metadata ?? {};

      // road exposure
      const roadId = cMeta.roadId ?? cMeta.road_id ?? cAny.roadId ?? cAny.road_id;
      if (typeof roadId === 'string' && roadId.length > 0) {
        md.roadId = roadId;
      }

      // hazard exposure
      const hazardTypes =
        cMeta.hazardTypes ?? cMeta.hazard_types ?? cAny.hazardTypes ?? cAny.hazard_types ?? cMeta.hazards;
      if (Array.isArray(hazardTypes)) {
        md.hazardTypes = hazardTypes.filter((h: any) => typeof h === 'string' && h.length > 0);
      }

      // elevation exposure
      const maxElevationM =
        cMeta.maxElevationM ?? cMeta.max_elevation_m ?? cAny.maxElevationM ?? cAny.max_elevation_m;
      if (typeof maxElevationM === 'number' && Number.isFinite(maxElevationM)) {
        md.maxElevationM = maxElevationM;
      }

      return { ...(s as any), metadata: md };
    });

    return { ...(plan as any), segments: rewritten };
  }
}

