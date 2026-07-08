/**
 * Canonical constraint fact — input to evaluation providers.
 * @see ADR-006-Unified-Decision-Runtime.md
 */

export type ConstraintFactSubjectType =
  | 'TRIP'
  | 'DAY'
  | 'ACTIVITY'
  | 'POI'
  | 'ROAD_SEGMENT'
  | 'MEMBER';

export type ConstraintFactSourceType =
  | 'OFFICIAL'
  | 'USER'
  | 'DERIVED'
  | 'MODEL'
  | 'LEGACY_ENGINE';

export type FreshnessStatus = 'FRESH' | 'STALE' | 'UNKNOWN';

export interface ConstraintFactSubject {
  type: ConstraintFactSubjectType;
  id: string;
}

export interface ConstraintFactSource {
  provider: string;
  sourceType: ConstraintFactSourceType;
  retrievedAt: string;
  validFrom?: string;
  validUntil?: string;
}

export interface ConstraintFact {
  factId: string;
  type: string;
  subject: ConstraintFactSubject;
  value: unknown;
  source: ConstraintFactSource;
  confidence: number;
  freshnessStatus: FreshnessStatus;
}
