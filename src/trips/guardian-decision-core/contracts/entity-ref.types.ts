/**
 * RFC-001 Phase 0 — shared ontology references.
 * @see docs/rfc/TripNARA_Ontology_Grounded_Guardian_Agents_RFC-001_v0.1.md
 */

export type EntityKind =
  | 'TRIP'
  | 'PLAN_VERSION'
  | 'DAY_PLAN'
  | 'DAY'
  | 'PLAN_ITEM'
  | 'ROUTE_SEGMENT'
  | 'POI'
  | 'REGION'
  | 'TRAVELER'
  | 'PARTY'
  | 'RESERVATION'
  | 'HAZARD_ZONE'
  | 'EXPERIENCE_INTENT';

export interface EntityRef {
  kind: EntityKind;
  id: string;
  label?: string;
}

export interface Money {
  amount: number;
  currency: string;
}

export interface RecoveryCondition {
  code: string;
  description: string;
  evidenceRefs?: string[];
}

export interface AdjustmentRequirement {
  code: string;
  description: string;
  /** Minimum reduction in minutes, if applicable */
  minReductionMinutes?: number;
  /** Minimum rest buffer to add in minutes */
  minRestBufferMinutes?: number;
  /** Latest acceptable end time (ISO-8601) */
  latestEndAt?: string;
  /** Traveler id acting as bottleneck constraint */
  bottleneckTravelerId?: string;
}

export interface ExternalSideEffect {
  kind: 'BOOKING' | 'PAYMENT' | 'CANCELLATION' | 'NOTIFICATION' | 'THIRD_PARTY_API';
  provider?: string;
  description: string;
  reversible: boolean;
  estimatedCost?: Money;
}
