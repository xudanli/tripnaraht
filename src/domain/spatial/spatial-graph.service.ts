/**
 * Spatial graph queries over Physical Domain tables (`SpatialDomainPoi`, `SpatialDomainSegment`).
 * Segments already link endpoints via `fromPoiId` / `toPoiId` — no separate related_poi_ids column needed.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type SpatialSegmentSummary = {
  id: string;
  segmentType: string;
  fromPoiId: string;
  toPoiId: string;
  evidence: unknown | null;
};

@Injectable()
export class SpatialGraphService {
  private readonly logger = new Logger(SpatialGraphService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * All segments incident on a spatial POI (either endpoint).
   */
  async findSegmentsTouchingSpatialPoi(spatialPoiId: string): Promise<SpatialSegmentSummary[]> {
    const rows = await this.prisma.spatialDomainSegment.findMany({
      where: {
        OR: [{ fromPoiId: spatialPoiId }, { toPoiId: spatialPoiId }],
      },
      select: {
        id: true,
        segmentType: true,
        fromPoiId: true,
        toPoiId: true,
        evidence: true,
      },
    });
    return rows.map((r) => ({
      id: r.id,
      segmentType: r.segmentType,
      fromPoiId: r.fromPoiId,
      toPoiId: r.toPoiId,
      evidence: r.evidence ?? null,
    }));
  }

  /**
   * Resolve admin spatial POI id from catalog `Place`:
   * 1) `metadata.spatialDomainPoiId` or `metadata.spatial_domain_poi_id`
   * 2) Exact name match on `SpatialDomainPoi.name` vs Place.nameCN / nameEN
   */
  async resolveSpatialPoiIdFromPlaceId(placeId: number): Promise<string | null> {
    const place = await this.prisma.place.findUnique({
      where: { id: placeId },
      select: { metadata: true, nameCN: true, nameEN: true },
    });
    if (!place) return null;

    const meta = (place.metadata as Record<string, unknown> | null) ?? {};
    const direct = meta['spatialDomainPoiId'] ?? meta['spatial_domain_poi_id'];
    if (typeof direct === 'string' && direct.trim()) {
      return direct.trim();
    }

    const names = [place.nameCN, place.nameEN].filter((n): n is string => typeof n === 'string' && n.trim().length > 0);
    for (const name of names) {
      const hit = await this.prisma.spatialDomainPoi.findFirst({
        where: { name },
        select: { id: true },
      });
      if (hit) return hit.id;
    }

    return null;
  }

  /** Prefer F-road segments for PhysicalValidator Iceland policy; else first segment. */
  pickSegmentForPhysicalGate(segments: SpatialSegmentSummary[]): SpatialSegmentSummary | null {
    if (segments.length === 0) return null;
    const f = segments.find((s) => s.segmentType === 'F_ROAD');
    return f ?? segments[0] ?? null;
  }

  /** Best-effort road ids from segment evidence (for downstream FRoad / audit hints). */
  extractRoadIdsFromEvidence(evidence: unknown | null): string[] {
    if (!evidence || typeof evidence !== 'object') return [];
    const text = JSON.stringify(evidence);
    const matches = text.match(/\bF\d{1,4}\b/gi);
    if (!matches) return [];
    return [...new Set(matches.map((m) => m.toUpperCase()))];
  }
}
