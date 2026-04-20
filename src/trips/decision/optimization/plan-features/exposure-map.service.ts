import { Injectable } from '@nestjs/common';
import type { RoutePlanDraft, RouteSegment } from '../../shared/world-model.types';

export interface ExposureMap {
  roadIdsTouched: string[];
  hazardTypesTouched: string[];
  maxElevationM?: number;
}

@Injectable()
export class ExposureMapService {
  extract(plan: RoutePlanDraft): ExposureMap {
    const segs = Array.isArray(plan?.segments) ? (plan.segments as RouteSegment[]) : [];
    const roadIds = new Set<string>();
    const hazardTypes = new Set<string>();
    let maxElevationM: number | undefined = undefined;

    for (const s of segs) {
      const md = (s as any).metadata ?? {};
      const roadId = md.roadId ?? md.road_id;
      if (typeof roadId === 'string' && roadId) roadIds.add(roadId);

      const hazards = md.hazardTypes ?? md.hazard_types ?? md.hazards;
      if (Array.isArray(hazards)) {
        for (const h of hazards) {
          if (typeof h === 'string' && h) hazardTypes.add(h);
        }
      }
      const elev = md.maxElevationM ?? md.max_elevation_m ?? md.elevationM;
      if (typeof elev === 'number' && Number.isFinite(elev)) {
        maxElevationM = maxElevationM === undefined ? elev : Math.max(maxElevationM, elev);
      }
    }

    return {
      roadIdsTouched: Array.from(roadIds),
      hazardTypesTouched: Array.from(hazardTypes),
      maxElevationM,
    };
  }
}

