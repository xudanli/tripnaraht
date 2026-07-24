/**
 * Destination Insight BFF — unified knowledge/evidence read model (tripnara.destination_insight@v1).
 * Pages must consume this BFF instead of calling RAG endpoints directly.
 */

export type DestinationInsightType =
  | 'RULE'
  | 'RISK'
  | 'SEASONAL_GUIDANCE'
  | 'ACTIVITY_GUIDANCE'
  | 'EXPLANATION'
  | 'ALTERNATIVE';

export type DestinationInsightSourceLevel = 'L1' | 'L2' | 'L3' | 'L4' | 'L5';

export interface DestinationInsightEvidenceRef {
  system:
    | 'RAG'
    | 'POI_ACCESS'
    | 'DESTINATION_PACK'
    | 'PLACE_ONTOLOGY'
    | 'ROAD_ONTOLOGY'
    | 'ROAD_IS'
    | 'FEASIBILITY'
    | 'OFFICIAL';
  refId: string;
  label?: string;
  url?: string;
  confidence?: number;
}

export interface DestinationInsight {
  id: string;
  type: DestinationInsightType;
  title: string;
  summary: string;
  applicability: {
    season?: string[];
    travelerTypes?: string[];
    transportModes?: string[];
    regions?: string[];
    poiSlugs?: string[];
    roadIds?: string[];
  };
  sourceLevel: DestinationInsightSourceLevel;
  sourceRefs: DestinationInsightEvidenceRef[];
  relatedConstraintIds?: string[];
  relatedTripObjectIds?: string[];
  relatedProblemIds?: string[];
  verifiedAt?: string;
  expiresAt?: string;
  /** When true, insight must not alone trigger hard constraints */
  explanatoryOnly: boolean;
}

export interface DestinationInsightBundle {
  schemaId: 'tripnara.destination_insight_bundle@v1';
  tripId: string;
  contextPackageId?: string;
  focus?: {
    conflictId?: string;
    problemId?: string;
    placeId?: number;
    poiSlug?: string;
    dayIndex?: number;
  };
  generatedAt: string;
  insights: DestinationInsight[];
  meta: {
    ragRetrievalSkipped?: boolean;
    skipReason?: string;
    conflictCount?: number;
    problemCount?: number;
  };
}

export interface DestinationInsightQuery {
  focusConflictId?: string;
  problemId?: string;
  placeId?: number;
  poiSlug?: string;
  dayIndex?: number;
  includeRag?: boolean;
}
