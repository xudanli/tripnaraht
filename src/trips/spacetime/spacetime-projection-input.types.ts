import type { SpatioTemporalAnchor } from './joint-anchor.types';

/**
 * Minimal compositional input for {@link projectSpacetime}.
 * Callers map weather / hotel / POI / route evidence into this shape.
 */
export interface SpacetimeProjectionInput {
  spatialFacets: Array<{
    anchorId: string;
    lat: number;
    lng: number;
    source: SpatioTemporalAnchor['source'];
    confidence: number;
  }>;
  /** Per-anchor windows — missing keys may receive an unbounded placeholder from {@link resolveTemporalWindows}. */
  temporalByAnchorId: Partial<Record<string, { start: number; end: number }>>;
}
