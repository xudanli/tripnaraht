/**
 * P0-3 POI CLOSED → Authority → Decision-tick materialization.
 *
 * Not a global sync. Not a Look→road.status path.
 * Authority = PoiAccessStatusOverride / Iceland access providers.
 *
 * Chain:
 *   Decision interest (poiId) → Authority resolve
 *   → materialize Canonical poiStates / WMC overlay / Gate
 *   → same-tick consumers share sourceVersion
 */

import type { PoiOperationalState } from '../../../decision-runtime/contracts/world-state-snapshot';

export const POI_AUTHORITY_BRIDGE_SCHEMA =
  'tripnara.poi_authority_decision_tick_bridge@v1' as const;

/**
 * Optional non-authoritative field hint (user/Look). Never seals open/closed.
 * Today Look has no OBSERVATION.POI.*; reserved for future hints.
 */
export interface PoiSuspectedClosedHint {
  tripId: string;
  poiId: string;
  /** Always false by contract */
  authoritative: false;
  predicate: 'poi.field_observation';
  suspectedAt: string;
  observationId?: string;
}

export type AuthorityPoiResolveOutcome =
  | {
      kind: 'RESOLVED';
      status: 'CLOSED' | 'OPEN' | 'LIMITED' | 'UNKNOWN';
      observedAt: string;
      sourceProvider: string;
      authority: 'OFFICIAL' | 'PARTNER' | 'INTERNAL' | 'MODEL';
      evidenceId: string;
      version: string;
      ruleType?: string;
    }
  | {
      kind: 'UNAVAILABLE';
      attemptedAt: string;
      reason: string;
      evidenceId: string;
      version: string;
    };

export interface DecisionPoiSourceVersion {
  evidenceId: string;
  observedAt: string;
  source: string;
  authority: string;
  version: string;
}

export type DecisionTickPoiConsumerStatus =
  | 'OPEN'
  | 'CLOSED'
  | 'RESTRICTED'
  | 'UNKNOWN'
  | 'UNVERIFIED';

export type GatePoiDisposition =
  | 'ALLOW_OPEN'
  | 'BLOCK_CLOSED'
  | 'NEED_CONFIRM'
  | 'DEGRADED_UNKNOWN';

export interface DecisionTickPoiMaterialization {
  schemaId: typeof POI_AUTHORITY_BRIDGE_SCHEMA;
  tickId: string;
  tripId: string;
  poiId: string;

  /** Present only when a non-authoritative hint triggered resolve */
  fieldHint?: PoiSuspectedClosedHint;

  authority: AuthorityPoiResolveOutcome;
  sourceVersion: DecisionPoiSourceVersion;
  poiStatus: DecisionTickPoiConsumerStatus;
  gateDisposition: GatePoiDisposition;

  /** CanonicalWorldStateSnapshot.poiStates overlay for this tick */
  canonicalPoiState: PoiOperationalState;

  /** WorldModelContext.physical.poiOperationalStates overlay */
  physicalPoiState: {
    poiId: string;
    open: boolean | null;
    status: DecisionTickPoiConsumerStatus;
    metadata?: Record<string, unknown>;
  };

  gateCanonicalPoi: {
    poiId: string;
    status: DecisionTickPoiConsumerStatus;
    sourceVersion: DecisionPoiSourceVersion;
  };

  /** Safety consumers that care about POI in this tick (Gate primary) */
  gateSees: {
    poi: DecisionTickPoiConsumerStatus;
    disposition: GatePoiDisposition;
    sourceVersion: DecisionPoiSourceVersion;
  };
  /** Bound into WMC / Canonical projections */
  worldSees: {
    poi: DecisionTickPoiConsumerStatus;
    sourceVersion: DecisionPoiSourceVersion;
  };
  canonicalSees: {
    poi: DecisionTickPoiConsumerStatus;
    sourceVersion: DecisionPoiSourceVersion;
  };

  hardConstraintsHonored: {
    fieldHintNeverAuthoritative: true;
    noForgedStatusOnAuthorityFailure: boolean;
    tickScopedOnly: true;
    sharedSourceVersion: true;
  };
}

export function buildPoiSuspectedClosedHint(input: {
  tripId: string;
  poiId: string;
  suspectedAt?: string;
  observationId?: string;
}): PoiSuspectedClosedHint {
  return {
    tripId: input.tripId,
    poiId: input.poiId.trim().toLowerCase(),
    authoritative: false,
    predicate: 'poi.field_observation',
    suspectedAt: input.suspectedAt ?? new Date().toISOString(),
    observationId: input.observationId,
  };
}
