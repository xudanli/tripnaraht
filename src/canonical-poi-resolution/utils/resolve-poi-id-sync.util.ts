import { ICELAND_CANONICAL_POI_CATALOG } from '../fixtures/iceland-canonical-poi.catalog';
import { runExactAliasStage } from '../pipeline/exact-alias.stage';
import type { CanonicalPOI, ResolutionResult } from '../types/canonical-poi.types';
import { normalizePoiQuery } from './normalize-poi-query.util';

export function isCanonicalTravelPoiId(poiId: string): boolean {
  const t = poiId.trim();
  return /^[a-z]{2}\.[a-z0-9_]+$/i.test(t) || /^poi_[a-z0-9_]+$/i.test(t);
}

export function readCanonicalPoiIdFromMetadata(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const m = metadata as Record<string, unknown>;
  if (typeof m.canonical_poi_id === 'string' && isCanonicalTravelPoiId(m.canonical_poi_id)) {
    return m.canonical_poi_id;
  }
  if (typeof m.poiId === 'string' && isCanonicalTravelPoiId(m.poiId)) {
    return m.poiId;
  }
  if (typeof m.poi_access_slug === 'string' && isCanonicalTravelPoiId(m.poi_access_slug)) {
    return m.poi_access_slug;
  }
  return undefined;
}

function catalogForCountry(countryCode?: string): CanonicalPOI[] {
  const cc = countryCode?.toUpperCase();
  if (!cc || cc === 'IS') return ICELAND_CANONICAL_POI_CATALOG;
  return [];
}

/** Sync CPRE — no DB / Nest; for Constraint Solver & slug utils */
export function resolveCanonicalPoiIdSync(input: {
  name: string;
  countryCode?: string;
}): Pick<ResolutionResult, 'status' | 'poiId' | 'confidence' | 'method'> {
  const trimmed = input.name?.trim();
  if (!trimmed) {
    return { status: 'NOT_FOUND', confidence: 0 };
  }

  const catalog = catalogForCountry(input.countryCode);
  const matches = runExactAliasStage({
    query: trimmed,
    countryCode: input.countryCode,
    catalog,
  });

  if (matches.length === 0) {
    return { status: 'NOT_FOUND', confidence: 0 };
  }

  const top = matches[0]!;
  if (top.confidence < 0.75) {
    return {
      status: 'NEEDS_CONFIRMATION',
      poiId: top.poi.poiId,
      confidence: top.confidence,
      method: top.method,
    };
  }

  return {
    status: 'MATCHED',
    poiId: top.poi.poiId,
    confidence: top.confidence,
    method: top.method,
  };
}

/** Scan text blob for catalog mentions → canonical poiIds */
export function resolvePoiIdsFromTextBlob(text: string, countryCode = 'IS'): string[] {
  const catalog = catalogForCountry(countryCode);
  const hayNorm = normalizePoiQuery(text);
  if (!hayNorm) return [];

  const ids = new Set<string>();
  const terms: Array<{ poiId: string; term: string }> = [];
  for (const poi of catalog) {
    for (const term of [poi.canonicalName, ...poi.aliases]) {
      if (term.trim().length >= 2) terms.push({ poiId: poi.poiId, term });
    }
  }
  terms.sort((a, b) => b.term.length - a.term.length);

  for (const { poiId, term } of terms) {
    if (ids.has(poiId)) continue;
    const termNorm = normalizePoiQuery(term);
    if (termNorm.length >= 2 && hayNorm.includes(termNorm)) {
      ids.add(poiId);
    }
  }

  return [...ids];
}
