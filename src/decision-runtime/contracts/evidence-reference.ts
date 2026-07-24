/**
 * Canonical evidence reference — shared by constraints, objectives, and explanations.
 * @see ADR-007-Decision-Runtime-v2.md
 */

export type EvidenceFreshnessStatus =
  | 'FRESH'
  | 'STALE'
  | 'MISSING'
  | 'LOW_CONFIDENCE';

export interface SourceVersion {
  provider: string;
  version: string;
  observedAt: string;
}

export interface EvidenceReference {
  id: string;
  entityType?: string;
  entityId?: string;
  constraintId?: string;
  evidenceSource: string;
  evidenceType?: string;
  observedAt: string;
  validUntil?: string;
  ruleId?: string;
  confidence?: number;
  conclusion?: string;
  freshness?: EvidenceFreshnessStatus;
  sourceVersion?: SourceVersion;
}
