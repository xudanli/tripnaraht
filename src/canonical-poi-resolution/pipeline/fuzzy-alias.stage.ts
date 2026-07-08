import type { CanonicalPOI, ResolutionEvidenceStep, ResolutionMethod } from '../types/canonical-poi.types';
import { normalizePoiQuery } from '../utils/normalize-poi-query.util';
import type { ExactAliasStageInput, StageMatchCandidate } from './exact-alias.stage';
import { dedupeStageCandidatesByPoiId } from './stage-match.util';

const MIN_TERM_LEN = 3;
const FUZZY_CONTAINS_CONFIDENCE = 0.86;
const FUZZY_QUERY_IN_TERM_CONFIDENCE = 0.84;

/**
 * Stage 2 — 子串模糊：query ⊂ alias 或 alias ⊂ query（CPRE P0.5）
 * 覆盖「塞里雅兰瀑布」「杰古沙龙冰河湖」等 AI 常见写法。
 */
export function runFuzzyAliasStage(input: ExactAliasStageInput): StageMatchCandidate[] {
  const normalizedQuery = normalizePoiQuery(input.query);
  if (!normalizedQuery || normalizedQuery.length < MIN_TERM_LEN) return [];

  const country = input.countryCode?.toUpperCase();
  const scoped =
    country != null
      ? input.catalog.filter((p) => p.country.toUpperCase() === country)
      : input.catalog;

  const candidates: StageMatchCandidate[] = [];

  for (const poi of scoped) {
    const terms = uniqueTerms([poi.canonicalName, ...poi.aliases]);
    for (const term of terms) {
      const normTerm = normalizePoiQuery(term);
      if (normTerm.length < MIN_TERM_LEN) continue;
      if (normTerm === normalizedQuery) continue;

      let confidence: number | undefined;
      let detail: string | undefined;

      if (normalizedQuery.includes(normTerm)) {
        confidence = FUZZY_CONTAINS_CONFIDENCE;
        detail = 'query contains alias substring';
      } else if (normTerm.includes(normalizedQuery)) {
        confidence = FUZZY_QUERY_IN_TERM_CONFIDENCE;
        detail = 'alias contains query substring';
      }

      if (confidence == null) continue;

      const evidence: ResolutionEvidenceStep[] = [
        { stage: 'INPUT', label: input.query },
        { stage: 'ALIAS', label: term, detail },
        { stage: 'CANONICAL', label: poi.poiId, detail: poi.canonicalName },
      ];

      candidates.push({
        poi,
        confidence,
        method: 'ALIAS' as ResolutionMethod,
        matchedAlias: term,
        evidence,
      });
    }
  }

  return dedupeStageCandidatesByPoiId(candidates);
}

function uniqueTerms(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const t = v.trim();
    if (!t) continue;
    const key = normalizePoiQuery(t);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}
