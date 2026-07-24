/**
 * RFC-001 Phase 0 — immutable PlanVersion (effective pointer on Trip).
 */

import type { PlanOperation } from './plan-operation.types';

export type PlanVersionCreatedBy =
  | 'USER'
  | 'PLANNER'
  | 'DECISION_CORE'
  | 'IMPORT'
  | 'ROLLBACK';

export type PlanVersionStatus =
  | 'DRAFT'
  | 'PENDING_AUTHORIZATION'
  | 'EFFECTIVE'
  | 'SUPERSEDED'
  | 'REJECTED'
  | 'ROLLED_BACK';

export interface PlanVersion {
  planVersionId: string;
  tripId: string;
  parentPlanVersionId?: string;
  createdBy: PlanVersionCreatedBy;
  sourceDecisionId?: string;
  operations: PlanOperation[];
  materializedPlanSnapshotRef: string;
  status: PlanVersionStatus;
  createdAt: string;
  effectiveAt?: string;
  /** Per-version metadata bag — TEP writes `tep` namespace */
  metadata?: Record<string, unknown>;
}

/** Trip holds only the effective pointer — creating a version ≠ making it effective */
export interface TripPlanVersionPointer {
  tripId: string;
  effectivePlanVersionId: string;
}
