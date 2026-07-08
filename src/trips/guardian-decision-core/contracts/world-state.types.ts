/**
 * RFC-001 Phase 0 — World State / Evidence Graph assertions.
 * Only Evidence Resolver may create or update; Guardians read-only.
 */

import type { EntityRef } from './entity-ref.types';

export type WorldStateSourceType =
  | 'OFFICIAL'
  | 'PARTNER'
  | 'USER'
  | 'MODEL'
  | 'INTERNAL';

export type WorldStateAssertionStatus =
  | 'ACTIVE'
  | 'SUPERSEDED'
  | 'EXPIRED'
  | 'DISPUTED';

export interface WorldStateAssertionSource {
  provider: string;
  sourceType: WorldStateSourceType;
  evidenceRefs: string[];
}

export interface WorldStateAssertion<TPayload = unknown> {
  assertionId: string;
  subjectRef: EntityRef;
  predicate: string;
  payload: TPayload;
  source: WorldStateAssertionSource;
  observedAt: string;
  validFrom: string;
  validUntil?: string;
  confidence: number;
  status: WorldStateAssertionStatus;
  version: number;
  supersedesAssertionId?: string;
}

/** Snapshot binding for Decision Workspace / Decision Record */
export interface WorldStateSnapshot {
  snapshotId: string;
  revision: string;
  capturedAt: string;
  assertionIds: string[];
}
