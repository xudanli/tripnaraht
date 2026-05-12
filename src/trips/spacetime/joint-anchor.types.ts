/**
 * P28 — Temporal–spatial joint kernel: time is not a separate subsystem but a dimension on anchors.
 */

export interface SpatioTemporalAnchor {
  anchorId: string;

  lat: number;
  lng: number;

  timeWindow: {
    /** Inclusive bound in epoch milliseconds (or consistent domain clock). */
    start: number;
    /** Inclusive bound in epoch milliseconds. */
    end: number;
  };

  source: 'WEATHER' | 'HOTEL' | 'POI' | 'ROUTE' | 'DERIVED';

  confidence: number;
}

/** Raw spatial facet before temporal merge — internal to projection. */
export type SpatialAnchorFacet = Omit<SpatioTemporalAnchor, 'timeWindow'>;
