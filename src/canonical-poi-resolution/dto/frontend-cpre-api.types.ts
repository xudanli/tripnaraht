/** CPRE 前端类型 — 复制到 features/exploration 或 features/poi-resolution */

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { message?: string; code?: string };
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

export interface CanonicalPOIView {
  poiId: string;
  canonicalName: string;
  aliases: string[];
  country: string;
  city?: string;
  lat?: number;
  lng?: number;
  category?: string;
  status: 'ACTIVE' | 'DEPRECATED' | 'PENDING';
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
  matchedPoi?: CanonicalPOIView;
  candidates?: ResolutionCandidate[];
  evidence?: ResolutionEvidenceStep[];
  reason?: string;
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

/** Exploration 候选内嵌 — generateCandidates / compare 返回 */
export interface ResolvedPoiRef {
  name: string;
  resolved: boolean;
  poiId?: string;
  confidence?: number;
  method?: string;
  status?: ResolutionStatus;
  canonicalName?: string;
}

export interface PoiResolutionBadge {
  label: string;
  tone: 'success' | 'warning' | 'muted';
}
