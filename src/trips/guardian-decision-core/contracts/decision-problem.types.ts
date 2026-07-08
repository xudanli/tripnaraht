/**
 * RFC-001 Phase 0 — Decision Problem (why a decision is required).
 */

import type { EntityRef } from './entity-ref.types';

export type Rfc001DecisionProblemType =
  | 'FEASIBILITY_FAILURE'
  | 'SCHEDULE_RISK'
  | 'EXCESSIVE_LOAD'
  | 'RESOURCE_UNAVAILABLE'
  | 'VALUE_TRADEOFF'
  | 'EXECUTION_FAILURE';

export type Rfc001DecisionProblemUrgency =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL';

export type Rfc001DecisionProblemStatus =
  | 'OPEN'
  | 'EVALUATING'
  | 'WAITING_HUMAN'
  | 'DECIDED'
  | 'EXECUTING'
  | 'RESOLVED'
  | 'FAILED';

/**
 * RFC-001 DecisionProblem — distinct from Decision Semantics V1.5 `DecisionProblem`.
 * Import as `Rfc001DecisionProblem` when both modules are in scope.
 */
export interface Rfc001DecisionProblem {
  problemId: string;
  tripId: string;
  planVersionId: string;
  type: Rfc001DecisionProblemType;
  triggerEventId: string;
  /** Ontology refs affected by the trigger (route, POI, region, etc.) */
  affectedEntityRefs: EntityRef[];
  /** Plan items that must be re-evaluated — required for travel decision capability */
  affectedPlanItemIds: string[];
  worldStateSnapshotId: string;
  detectedAt: string;
  urgency: Rfc001DecisionProblemUrgency;
  status: Rfc001DecisionProblemStatus;
  /** Canonical capability key for Gateway routing (RFC-002) */
  semanticCapability?: string;
}
