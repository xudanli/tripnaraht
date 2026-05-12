import type { SpatialAnchorFacet, SpatioTemporalAnchor } from './joint-anchor.types';
import type { SpacetimeProjectionInput } from './spacetime-projection-input.types';

/**
 * Pure spatial resolution — no clock until merged with {@link resolveTemporalWindows}.
 */
export function resolveAnchorKernel(input: SpacetimeProjectionInput): SpatialAnchorFacet[] {
  return input.spatialFacets.map(f => ({
    anchorId: f.anchorId,
    lat: f.lat,
    lng: f.lng,
    source: f.source,
    confidence: f.confidence,
  }));
}

export interface TemporalWindowResolver {
  forAnchor(anchorId: string): { start: number; end: number };
}

/**
 * Builds a lookup for anchor-bound windows. Anchors without data get an unbounded window
 * (caller may filter low-confidence joints downstream).
 */
export function resolveTemporalWindows(input: SpacetimeProjectionInput): TemporalWindowResolver {
  const map = input.temporalByAnchorId;
  return {
    forAnchor(anchorId: string) {
      const w = map[anchorId];
      if (w && Number.isFinite(w.start) && Number.isFinite(w.end)) {
        return w;
      }
      return {
        start: Number.NEGATIVE_INFINITY,
        end: Number.POSITIVE_INFINITY,
      };
    },
  };
}

/**
 * Spacetime projection engine — fuses spatial facets with per-anchor temporal windows.
 */
export function projectSpacetime(input: SpacetimeProjectionInput): SpatioTemporalAnchor[] {
  const spatial = resolveAnchorKernel(input);
  const temporal = resolveTemporalWindows(input);

  return spatial.map(a => ({
    ...a,
    timeWindow: temporal.forAnchor(a.anchorId),
  }));
}
