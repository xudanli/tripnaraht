import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  GUIDE_GEO_RESOLUTION_STATUS,
  type ResolvedGuidePoi,
} from '../types/guide-spatial.types';

type PlaceGeoRow = {
  id: number;
  uuid: string;
  nameCN: string;
  nameEN: string | null;
  category: string;
  lat: number;
  lng: number;
  countryCode: string | null;
};

/**
 * POI 实体层：攻略文本地点 → TripNARA Place ID + 经纬度 + 导航点。
 */
@Injectable()
export class GuidePoiGeoService {
  private readonly logger = new Logger(GuidePoiGeoService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolvePlaceEntity(
    placeId: number,
    sourceText: string,
    matchConfidence: number,
  ): Promise<ResolvedGuidePoi | null> {
    const rows = await this.prisma.$queryRaw<PlaceGeoRow[]>`
      SELECT p.id, p.uuid, p."nameCN", p."nameEN", p.category::text as category,
             ST_Y(p.location::geometry) as lat, ST_X(p.location::geometry) as lng,
             c."countryCode" as "countryCode"
      FROM "Place" p
      LEFT JOIN "City" c ON c.id = p."cityId"
      WHERE p.id = ${placeId} AND p.location IS NOT NULL
      LIMIT 1
    `;
    const row = rows[0];
    if (!row || !Number.isFinite(row.lat) || !Number.isFinite(row.lng)) {
      return null;
    }

    const navigationPoint = { lat: row.lat, lng: row.lng };
    return {
      placeId: row.id,
      placeUuid: row.uuid,
      sourceText,
      matchedName: row.nameCN,
      matchedNameEn: row.nameEN,
      latitude: row.lat,
      longitude: row.lng,
      navigationPoint,
      countryCode: row.countryCode ?? undefined,
      poiType: row.category,
      matchConfidence,
      geoResolutionStatus: GUIDE_GEO_RESOLUTION_STATUS.ROUTABLE,
    };
  }

  async attachGeoToCandidate(
    candidateId: string,
    placeId: number,
    sourceText: string,
    matchConfidence: number,
  ): Promise<ResolvedGuidePoi | null> {
    const resolved = await this.resolvePlaceEntity(placeId, sourceText, matchConfidence);
    if (!resolved) {
      await this.prisma.guideInspirationCandidate.update({
        where: { id: candidateId },
        data: {
          metadata: {
            geoResolutionStatus: GUIDE_GEO_RESOLUTION_STATUS.MATCHED,
            matchConfidence,
          } as object,
        },
      });
      return null;
    }

    await this.prisma.guideInspirationCandidate.update({
      where: { id: candidateId },
      data: {
        metadata: {
          poi: resolved,
          geoResolutionStatus: resolved.geoResolutionStatus,
          matchConfidence,
        } as object,
      },
    });

    return resolved;
  }

  parseCandidateGeo(metadata: unknown): ResolvedGuidePoi | null {
    if (!metadata || typeof metadata !== 'object') return null;
    const obj = metadata as Record<string, unknown>;
    const poi = obj.poi;
    if (!poi || typeof poi !== 'object') return null;
    const p = poi as ResolvedGuidePoi;
    if (typeof p.placeId !== 'number' || typeof p.latitude !== 'number') return null;
    return p;
  }

  async rematchSessionGeo(sessionId: string, defaultMatchConfidence = 0.85) {
    const candidates = await this.prisma.guideInspirationCandidate.findMany({
      where: { sessionId, placeId: { not: null } },
      select: { id: true, placeId: true, rawName: true, metadata: true },
    });

    for (const c of candidates) {
      if (!c.placeId) continue;
      const existing = this.parseCandidateGeo(c.metadata);
      if (existing?.geoResolutionStatus === GUIDE_GEO_RESOLUTION_STATUS.ROUTABLE) {
        continue;
      }
      await this.attachGeoToCandidate(c.id, c.placeId, c.rawName, defaultMatchConfidence);
    }

    this.logger.debug(`Geo resolved candidates for session ${sessionId}`);
  }
}
