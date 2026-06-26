import type { ReadinessFinding } from '../types/readiness-findings.types';
import type { SupportedLanguage } from '../types/readiness-pack.types';
import { RiskTypeMapperService } from '../services/risk-type-mapper.service';
import {
  inferPlaceIdsForHazardType,
  stripItineraryPlaceSuffix,
  isItineraryPlaceOnlyMessage,
  type TripPlaceRef,
} from './itinerary-readiness-context.util';
import { getLocalizedText, getLocalizedTexts } from './i18n.utils';

export interface TripPoiMapEntry {
  name: string;
  nameCN?: string;
  day: number;
}

export function buildTripPlaceRefsFromPrismaTrip(trip: {
  TripDay?: Array<{
    ItineraryItem?: Array<{
      Place?: {
        id: number;
        nameEN?: string | null;
        nameCN?: string | null;
        category?: string | null;
        metadata?: unknown;
      } | null;
    }>;
  }>;
}): { poiMap: Map<number, TripPoiMapEntry>; tripPlaceRefs: TripPlaceRef[] } {
  const poiMap = new Map<number, TripPoiMapEntry>();
  const tripPlaceRefs: TripPlaceRef[] = [];
  const seenPlace = new Set<number>();

  trip.TripDay?.forEach((day, dayIndex) => {
    day.ItineraryItem?.forEach((item) => {
      if (!item.Place) return;
      const placeId = item.Place.id;
      if (seenPlace.has(placeId)) return;
      seenPlace.add(placeId);
      const md = (item.Place.metadata as Record<string, unknown>) || {};
      const canonicalType = typeof md.canonicalType === 'string' ? md.canonicalType : undefined;
      const nameEN = item.Place.nameEN || undefined;
      const nameCN = item.Place.nameCN ?? undefined;
      const name = nameEN || nameCN || `POI ${placeId}`;
      poiMap.set(placeId, {
        name,
        nameCN,
        day: dayIndex + 1,
      });
      tripPlaceRefs.push({
        placeId,
        day: dayIndex + 1,
        name,
        nameCN,
        canonicalType,
        category: item.Place.category || '',
      });
    });
  });

  return { poiMap, tripPlaceRefs };
}

/** 与 GET /readiness/trip/:id 一致：Pack 风险附着行程 POI + 本地化 summary */
export function enrichFindingsRisksForTrip(
  findings: ReadinessFinding[],
  poiMap: Map<number, TripPoiMapEntry>,
  tripPlaceRefs: TripPlaceRef[],
  lang: SupportedLanguage,
  riskTypeMapper: RiskTypeMapperService,
): ReadinessFinding[] {
  if (!findings.length) return findings;

  return findings.map((finding) => {
    if (!finding.risks?.length) return finding;

    const risks = finding.risks.map((r) => {
      let summaryText = getLocalizedText(r.summary as any, lang);
      const mitigations = getLocalizedTexts((r as any).mitigations, lang);

      let poiIds: number[] = [];
      if ((r as any).affectedPois?.length) {
        poiIds = (r as any).affectedPois
          .map((poiId: unknown) => {
            if (poiId != null && typeof poiId === 'object' && 'id' in (poiId as object)) {
              const id = (poiId as { id?: string | number }).id;
              return typeof id === 'number' ? id : parseInt(String(id), 10);
            }
            return typeof poiId === 'number' ? poiId : parseInt(String(poiId), 10);
          })
          .filter((n: number) => !Number.isNaN(n));
      } else {
        poiIds = inferPlaceIdsForHazardType(String(r.type || ''), tripPlaceRefs);
      }

      if (poiIds.length > 0) {
        summaryText = stripItineraryPlaceSuffix(summaryText);
        if (isItineraryPlaceOnlyMessage(summaryText)) {
          summaryText = '';
        }
      }

      const baseRisk: any = {
        ...r,
        summary: summaryText,
        message: summaryText,
        mitigations,
        sourceType: 'readiness',
        severity: (r.severity || 'medium') as 'high' | 'medium' | 'low',
        affectedPois: poiIds.map((poiIdNum) => {
          const poiInfo = poiMap.get(poiIdNum);
          if (poiInfo) {
            return {
              id: poiIdNum.toString(),
              name: poiInfo.name,
              nameCN: poiInfo.nameCN,
              day: poiInfo.day,
            };
          }
          return { id: poiIdNum.toString(), name: `POI ${poiIdNum}`, day: undefined };
        }),
        sources: (r as any).sources,
      };

      return riskTypeMapper.enhanceRisk(baseRisk, lang);
    });

    return { ...finding, risks };
  });
}

export function resolveRiskFieldsForApi(
  r: {
    summary?: unknown;
    message?: unknown;
    mitigations?: unknown[];
  },
  lang: SupportedLanguage,
): { summary: string; message: string; mitigations: string[] } {
  const summary = getLocalizedText(r.summary as any, lang) || getLocalizedText(r.message as any, lang);
  return {
    summary,
    message: summary,
    mitigations: getLocalizedTexts(r.mitigations as any, lang),
  };
}
