import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { EntityResolutionResult } from '../../places/services/entity-resolution.service';
import { ICELAND_CANONICAL_POI_COORDS } from '../fixtures/iceland-poi-coords';
import { CanonicalPoiResolutionService } from '../services/canonical-poi-resolution.service';
import type { ResolutionResult } from '../types/canonical-poi.types';

export interface CpreEntityResolutionAttempt {
  result: EntityResolutionResult | null;
  clarification?: {
    poi: string;
    options: string[];
    candidatePoiIds: string[];
  };
}

export function inferEntityResolutionCountryCode(input: {
  countryCode?: string;
  query?: string;
  cities?: string[];
  lat?: number;
  lng?: number;
}): string | undefined {
  if (input.countryCode?.trim()) {
    return input.countryCode.trim().toUpperCase();
  }
  const blob = `${input.query ?? ''} ${(input.cities ?? []).join(' ')}`.toLowerCase();
  if (/冰岛|iceland|reykjav[ií]k|雷克雅未克|南岸|黄金圈/.test(blob)) {
    return 'IS';
  }
  const lat = input.lat;
  const lng = input.lng;
  if (lat != null && lng != null && lat >= 63 && lat <= 67.8 && lng >= -24.9 && lng <= -12.5) {
    return 'IS';
  }
  return undefined;
}

/**
 * Agent / Places EntityResolution → CPRE 桥接（冰岛 MVP）
 */
@Injectable()
export class CpreEntityResolutionBridge {
  private readonly logger = new Logger(CpreEntityResolutionBridge.name);

  constructor(
    private readonly cpre: CanonicalPoiResolutionService,
    private readonly prisma: PrismaService,
  ) {}

  isEnabledForCountry(countryCode?: string): boolean {
    return countryCode?.toUpperCase() === 'IS';
  }

  async tryResolvePoiQuery(
    poiQuery: string,
    countryCode: string,
  ): Promise<CpreEntityResolutionAttempt> {
    if (!this.isEnabledForCountry(countryCode)) {
      return { result: null };
    }

    const resolution = await this.cpre.resolve({ name: poiQuery, countryCode });

    if (resolution.status === 'AMBIGUOUS' || resolution.status === 'NEEDS_CONFIRMATION') {
      const candidates = resolution.candidates ?? [];
      return {
        result: null,
        clarification: {
          poi: poiQuery,
          options: candidates.map((c) => c.canonicalName),
          candidatePoiIds: candidates.map((c) => c.poiId),
        },
      };
    }

    if (resolution.status !== 'MATCHED' || !resolution.poiId) {
      return { result: null };
    }

    const entity = await this.toEntityResolutionResult(poiQuery, resolution);
    if (!entity) {
      return { result: null };
    }

    this.logger.debug(
      `CPRE bridge: "${poiQuery}" → ${resolution.poiId} (${resolution.method})`,
    );
    return { result: entity };
  }

  private async toEntityResolutionResult(
    poiQuery: string,
    resolution: ResolutionResult,
  ): Promise<EntityResolutionResult | null> {
    const poiId = resolution.poiId!;
    const canonical = resolution.matchedPoi;
    const fromDb = await this.findPlaceByCanonicalPoiId(poiId);

    const coords =
      fromDb?.lat != null && fromDb.lng != null
        ? { lat: fromDb.lat, lng: fromDb.lng }
        : ICELAND_CANONICAL_POI_COORDS[poiId];

    if (!coords) {
      this.logger.warn(`CPRE bridge: no coordinates for ${poiId}, skipping entity result`);
      return null;
    }

    const methodLabel = resolution.method ?? 'ALIAS';
    return {
      id: fromDb?.id ?? 0,
      name: canonical?.canonicalName ?? poiQuery,
      nameCN: fromDb?.nameCN ?? poiQuery,
      nameEN: fromDb?.nameEN ?? canonical?.canonicalName ?? null,
      address: fromDb?.address ?? null,
      category: fromDb?.category ?? 'ATTRACTION',
      lat: coords.lat,
      lng: coords.lng,
      score: resolution.confidence,
      source: 'cpre',
      matchReasons: [`CPRE ${methodLabel}`, `poiId=${poiId}`],
      metadata: {
        canonical_poi_id: poiId,
        poi_access_slug: poiId,
        cpre: {
          status: resolution.status,
          method: resolution.method,
          evidence: resolution.evidence,
        },
      },
    };
  }

  private async findPlaceByCanonicalPoiId(poiId: string): Promise<{
    id: number;
    nameCN: string;
    nameEN: string | null;
    address: string | null;
    category: string;
    lat: number | null;
    lng: number | null;
  } | null> {
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{
          id: number;
          nameCN: string;
          nameEN: string | null;
          address: string | null;
          category: string;
          lat: number | null;
          lng: number | null;
        }>
      >`
        SELECT
          id,
          "nameCN",
          "nameEN",
          address,
          category::text as category,
          ST_Y(location::geometry) as lat,
          ST_X(location::geometry) as lng
        FROM "Place"
        WHERE location IS NOT NULL
          AND (
            metadata->>'poi_access_slug' = ${poiId}
            OR metadata->>'canonical_poi_id' = ${poiId}
          )
        LIMIT 1
      `;
      return rows[0] ?? null;
    } catch {
      return null;
    }
  }
}
