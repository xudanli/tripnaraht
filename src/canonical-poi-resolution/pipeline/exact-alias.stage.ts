import {
  ICELAND_POI_SLUG_RESOLVERS,
} from '../../poi-access-capacity/fixtures/iceland-poi-registry';
import type {
  CanonicalPOI,
  ResolutionEvidenceStep,
  ResolutionMethod,
} from '../types/canonical-poi.types';
import { normalizePoiQuery, poiQueryEquals } from '../utils/normalize-poi-query.util';

import { dedupeStageCandidatesByPoiId } from './stage-match.util';

export interface StageMatchCandidate {
  poi: CanonicalPOI;
  confidence: number;
  method: ResolutionMethod;
  matchedAlias?: string;
  evidence: ResolutionEvidenceStep[];
}

export interface ExactAliasStageInput {
  query: string;
  countryCode?: string;
  catalog: CanonicalPOI[];
}

const EXACT_CANONICAL_CONFIDENCE = 0.99;
const EXACT_ALIAS_CONFIDENCE = 0.97;
const PATTERN_ALIAS_CONFIDENCE = 0.92;

export function runExactAliasStage(input: ExactAliasStageInput): StageMatchCandidate[] {
  const normalizedQuery = normalizePoiQuery(input.query);
  if (!normalizedQuery) return [];

  const country = input.countryCode?.toUpperCase();
  const scoped =
    country != null
      ? input.catalog.filter((p) => p.country.toUpperCase() === country)
      : input.catalog;

  const candidates: StageMatchCandidate[] = [];

  for (const poi of scoped) {
    const baseEvidence: ResolutionEvidenceStep[] = [
      { stage: 'INPUT', label: input.query },
    ];

    if (poiQueryEquals(input.query, poi.canonicalName)) {
      candidates.push({
        poi,
        confidence: EXACT_CANONICAL_CONFIDENCE,
        method: 'EXACT',
        evidence: [
          ...baseEvidence,
          { stage: 'EXACT', label: poi.canonicalName, detail: 'canonical name exact match' },
          { stage: 'CANONICAL', label: poi.poiId, detail: poi.canonicalName },
        ],
      });
      continue;
    }

    const aliasHit = poi.aliases.find((a) => poiQueryEquals(input.query, a));
    if (aliasHit) {
      candidates.push({
        poi,
        confidence: EXACT_ALIAS_CONFIDENCE,
        method: 'ALIAS',
        matchedAlias: aliasHit,
        evidence: [
          ...baseEvidence,
          { stage: 'ALIAS', label: aliasHit, detail: 'alias exact match' },
          { stage: 'CANONICAL', label: poi.poiId, detail: poi.canonicalName },
        ],
      });
    }
  }

  if (candidates.length > 0) {
    return dedupeStageCandidatesByPoiId(candidates);
  }

  for (const resolver of ICELAND_POI_SLUG_RESOLVERS) {
    if (!resolver.patterns.some((p) => p.test(input.query))) continue;
    const poi = scoped.find((p) => p.poiId === resolver.slug);
    if (!poi) continue;

    candidates.push({
      poi,
      confidence: PATTERN_ALIAS_CONFIDENCE,
      method: 'ALIAS',
      matchedAlias: input.query,
      evidence: [
        { stage: 'INPUT', label: input.query },
        { stage: 'ALIAS', label: input.query, detail: 'pattern alias match' },
        { stage: 'CANONICAL', label: poi.poiId, detail: poi.canonicalName },
      ],
    });
  }

  return dedupeStageCandidatesByPoiId(candidates);
}
