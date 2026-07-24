import type { TravelContextStage, TravelContextViewName } from '../domain/travel-context.constants';
import type { TravelContextSnapshot, TravelContextViewEnvelope } from '../domain/travel-context.types';

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export interface TravelContextResolveView {
  contextId: string;
  tripId?: string;
  scenarioId?: string;
  revision: number;
  snapshotId: string;
  stage: TravelContextStage;
  source: string;
}

export interface TravelContextViewsIndex {
  contextId: string;
  revision: number;
  snapshotId: string;
  views: Array<{ view: TravelContextViewName; path: string }>;
}

export type TravelContextViewData = Record<string, unknown>;

export interface TravelContextProviderState {
  contextId: string;
  revision: number;
  snapshotId: string;
  stage: TravelContextStage;
  views: Partial<Record<TravelContextViewName, TravelContextViewEnvelope>>;
  snapshot?: TravelContextSnapshot;
  loading: boolean;
  error?: string;
}

export interface TravelContextProviderOptions {
  contextId: string;
  token: string;
  baseUrl?: string;
  /** Initial views to prefetch */
  prefetchViews?: TravelContextViewName[];
  /** Subscribe to CONTEXT_REVISION_CHANGED SSE (RFC-003 Phase 5) */
  subscribeRevisionEvents?: boolean;
}

export interface TravelContextIntentResult {
  outcome: 'APPLIED' | 'REJECTED' | 'WAITING_USER' | 'NO_CHANGE' | 'FAILED_SAFE';
  intentType: string;
  contextId: string;
  previousRevision: number;
  revision: number;
  snapshotId: string;
  stage: TravelContextStage;
  changedDomains: string[];
  domainResult?: unknown;
  diff?: TravelContextDiff;
}

export interface TravelContextDiff {
  contextId: string;
  fromRevision: number;
  toRevision: number;
  changedDomains: string[];
  changes: Array<{
    path: string;
    operation: 'ADD' | 'UPDATE' | 'REMOVE';
    entityId?: string;
    domain?: string;
  }>;
  requiresFullRefresh?: boolean;
}

export interface TravelContextRevisionEvent {
  type: 'CONTEXT_REVISION_CHANGED';
  contextId: string;
  revision: number;
  previousRevision: number;
  changedDomains: string[];
  snapshotId: string;
}

export interface TravelContextIntentRequest {
  type: string;
  payload?: Record<string, unknown>;
  basedOnRevision: number;
  idempotencyKey?: string;
}

/** RFC-003 `views/exploration` 投影（Travel Ontology 字段） */
export interface TravelContextExplorationView {
  stage: string;
  scenarioId?: string;
  tripId?: string | null;
  planExecutability?: string;
  ontologyConstraints?: {
    blockerCount: number;
    warningCount: number;
    codes: string[];
  };
  ontologyIssueCount?: number;
  ontologyBlockerCount?: number;
  revision?: number;
}

/** RFC-003 `views/feasibility` 投影摘要 */
export interface TravelContextFeasibilityView {
  planExecutability?: string;
  ontologyConstraints?: {
    blockerCount: number;
    warningCount: number;
    codes: string[];
  };
  revision?: number;
}

export interface TravelContextProvider {
  getState: () => TravelContextProviderState;
  subscribe: (listener: () => void) => () => void;
  refresh: () => Promise<void>;
  getView: (view: TravelContextViewName) => Promise<TravelContextViewEnvelope>;
  resolveFromTrip: (tripId: string) => Promise<TravelContextResolveView>;
  submitIntent: (intent: TravelContextIntentRequest) => Promise<TravelContextIntentResult>;
  fetchDiff: (sinceRevision: number) => Promise<TravelContextDiff>;
  /** Returns unsubscribe when SSE supported (browser EventSource) */
  subscribeRevisionEvents?: () => () => void;
}
