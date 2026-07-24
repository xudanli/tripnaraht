export type CanonicalPoiStatus = 'ACTIVE' | 'DEPRECATED' | 'PENDING';

export interface CanonicalPOI {
  poiId: string;
  canonicalName: string;
  aliases: string[];
  country: string;
  city?: string;
  lat?: number;
  lng?: number;
  category?: string;
  subCategory?: string;
  popularity?: number;
  status: CanonicalPoiStatus;
}

export type ResolutionStatus =
  | 'MATCHED'
  | 'AMBIGUOUS'
  | 'NOT_FOUND'
  | 'NEEDS_CONFIRMATION';

export type ResolutionMethod =
  | 'EXACT'
  | 'ALIAS'
  | 'FUZZY'
  | 'EMBEDDING'
  | 'GEO_RANK'
  | 'EXTERNAL'
  | 'HUMAN';

export interface ResolutionEvidenceStep {
  stage: string;
  label: string;
  detail?: string;
}

export interface ResolutionCandidate {
  poiId: string;
  canonicalName: string;
  confidence: number;
}

export interface ResolutionResult {
  status: ResolutionStatus;
  method?: ResolutionMethod;
  poiId?: string;
  confidence: number;
  matchedPoi?: CanonicalPOI;
  candidates?: ResolutionCandidate[];
  evidence?: ResolutionEvidenceStep[];
  reason?: string;
}

export interface ResolvePoiInput {
  name: string;
  countryCode?: string;
  locale?: string;
  lat?: number;
  lng?: number;
  tripId?: string;
}

export interface ResolvePoiBatchSummary {
  total: number;
  matched: number;
  ambiguous: number;
  notFound: number;
  needsConfirmation: number;
}

export interface ResolvePoiBatchResult {
  results: ResolutionResult[];
  summary: ResolvePoiBatchSummary;
}

/** Planner 未解析引用 */
export interface UnresolvedPoiRef {
  name: string;
  resolved: false;
}

/** Planner 已解析引用 */
export interface ResolvedPoiRef {
  name: string;
  poiId: string;
  confidence: number;
  resolved: true;
  method?: ResolutionMethod;
}

export const CPRE_MATCH_CONFIDENCE_THRESHOLD = 0.75;
export const CPRE_AMBIGUITY_DELTA = 0.05;
