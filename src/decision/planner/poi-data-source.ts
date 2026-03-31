import type { WorldPoiRecord } from './poi-world-model.mock';
import { defaultPoiProviders } from './poi-data-source.providers';

export function resolveWorldPoisFromSources(
  destination: string,
  researchPoiEvidence?: unknown,
): { source: 'vector_search' | 'research' | 'mock'; confidence: number; pois: WorldPoiRecord[] } {
  const providers = defaultPoiProviders();
  const results = providers.map((p) =>
    p.fetch({ destination, researchPoiEvidence }),
  );
  const best = results.sort((a, b) => b.confidence - a.confidence)[0];
  if (best && best.pois.length > 0) {
    return {
      source:
        best.source === 'vector_search'
          ? 'vector_search'
          : best.source === 'research'
            ? 'research'
            : 'mock',
      confidence: best.confidence,
      pois: best.pois,
    };
  }
  return {
    source: 'mock',
    confidence: 0.4,
    pois: [],
  };
}
