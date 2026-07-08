import type { TravelContextDomain, TravelContextStage } from '../domain/travel-context.constants';

/** RFC-003 §8.2.1 — V1 intent types */
export const TRAVEL_CONTEXT_INTENT_TYPES = [
  'CHANGE_EXPLORATION_CONDITIONS',
  'SET_PRINCIPLES',
  'GENERATE_CANDIDATES',
  'SELECT_ROUTE',
  'MATERIALIZE_TRIP',
  'RUN_FEASIBILITY_CHECK',
  'ACCEPT_DECISION_OPTION',
  'APPLY_DECISION',
  'CHANGE_CONTRACT_CONSTRAINT',
  'NATURAL_LANGUAGE',
  /** Harness-only until canonical plan apply lands */
  'UPDATE_INTENT',
  'APPLY_PLAN',
] as const;

export type TravelContextIntentType = (typeof TRAVEL_CONTEXT_INTENT_TYPES)[number];

export type TravelContextIntentOutcome =
  | 'APPLIED'
  | 'REJECTED'
  | 'WAITING_USER'
  | 'NO_CHANGE'
  | 'FAILED_SAFE';

export interface SubmitTravelContextIntentInput {
  type: TravelContextIntentType;
  payload?: Record<string, unknown>;
  basedOnRevision: number;
  idempotencyKey?: string;
}

export interface TravelContextIntentResult {
  outcome: TravelContextIntentOutcome;
  intentType: TravelContextIntentType;
  contextId: string;
  previousRevision: number;
  revision: number;
  snapshotId: string;
  stage: TravelContextStage;
  changedDomains: TravelContextDomain[];
  domainResult?: unknown;
  reasonCodes?: string[];
  diff?: {
    fromRevision: number;
    toRevision: number;
    changedDomains: TravelContextDomain[];
    changes: Array<{
      path: string;
      operation: 'ADD' | 'UPDATE' | 'REMOVE';
      entityId?: string;
      domain?: TravelContextDomain;
    }>;
  };
}

export interface RevisionConflictDetails {
  expectedRevision: number;
  currentRevision: number;
  changedDomains?: TravelContextDomain[];
}
