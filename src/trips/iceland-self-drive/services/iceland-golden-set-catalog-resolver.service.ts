/**
 * Catalog resolution gate before Golden Set entities enter authoritative candidates.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { loadPlaceCoordinatesBatch } from '../../attraction-explore/utils/attraction-explore-place-coordinates.util';
import type {
  CatalogResolutionIssue,
  CatalogResolutionIssueCode,
} from '../types/iceland-initial-plan-seed.types';
import type { IcelandRegionEntityType } from '../types/iceland-region-planning-pack.types';

export interface ResolvedCatalogPlace {
  placeId: number;
  nameCN: string;
  nameEN: string | null;
  category: string | null;
  lat: number | null;
  lng: number | null;
  ok: boolean;
  issues: CatalogResolutionIssue[];
}

const TOWN_AS_LODGING_SUSPECT = new Set([381042, 381047, 381092, 381085, 381097, 381288]);

/** Known QA: must bind visit-point, not glacier centroid */
const VISIT_POINT_QA = new Set([381098]);

@Injectable()
export class IcelandGoldenSetCatalogResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolvePlaceIds(
    placeIds: number[],
    hints?: Array<{ placeId: number; expectedEntityType?: IcelandRegionEntityType }>,
  ): Promise<Map<number, ResolvedCatalogPlace>> {
    const unique = [...new Set(placeIds.filter((id) => Number.isFinite(id) && id > 0))];
    const out = new Map<number, ResolvedCatalogPlace>();
    if (unique.length === 0) return out;

    const rows = await this.prisma.place.findMany({
      where: { id: { in: unique } },
      select: {
        id: true,
        nameCN: true,
        nameEN: true,
        category: true,
        metadata: true,
      },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const coordsMap = await loadPlaceCoordinatesBatch(this.prisma, unique);
    const hintById = new Map(
      (hints ?? []).map((h) => [h.placeId, h.expectedEntityType]),
    );

    for (const id of unique) {
      const row = byId.get(id);
      const issues: CatalogResolutionIssue[] = [];
      if (!row) {
        issues.push(issue(id, 'PLACE_NOT_FOUND', `Place ${id} not in Catalog`, 'ERROR'));
        out.set(id, {
          placeId: id,
          nameCN: '',
          nameEN: null,
          category: null,
          lat: null,
          lng: null,
          ok: false,
          issues,
        });
        continue;
      }

      const coords = coordsMap.get(id) ?? null;
      if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) {
        issues.push(
          issue(id, 'MISSING_COORDINATES', `Place ${id} missing coordinates`, 'ERROR'),
        );
      }

      const expected = hintById.get(id);
      if (expected === 'LODGING' && TOWN_AS_LODGING_SUSPECT.has(id)) {
        issues.push(
          issue(
            id,
            'TOWN_AS_LODGING',
            `Place ${id} looks like town/base hub, not confirmed lodging product`,
            'WARNING',
          ),
        );
      }

      if (VISIT_POINT_QA.has(id)) {
        issues.push(
          issue(
            id,
            'CENTROID_NOT_VISIT_POINT',
            `Place ${id} needs Catalog visit-point verification (not glacier centroid)`,
            'WARNING',
          ),
        );
      }

      if (expected === 'ATTRACTION' || expected === 'ATTRACTION_AREA') {
        const cat = (row.category ?? '').toUpperCase();
        if (cat && cat !== 'ATTRACTION' && cat !== 'SERVICE') {
          // HOTEL as attraction is mismatch
          if (cat === 'HOTEL' || cat === 'SUPPLY') {
            issues.push(
              issue(
                id,
                'ENTITY_TYPE_MISMATCH',
                `Place ${id} category=${cat} vs expected ${expected}`,
                'WARNING',
              ),
            );
          }
        }
      }

      const hardFail = issues.some((i) => i.severity === 'ERROR');
      out.set(id, {
        placeId: id,
        nameCN: row.nameCN,
        nameEN: row.nameEN,
        category: row.category,
        lat: coords?.lat ?? null,
        lng: coords?.lng ?? null,
        ok: !hardFail,
        issues,
      });
    }

    return out;
  }
}

function issue(
  placeId: number,
  code: CatalogResolutionIssueCode,
  message: string,
  severity: 'WARNING' | 'ERROR',
): CatalogResolutionIssue {
  return { placeId, code, message, severity };
}
