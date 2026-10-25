/**
 * P0-1 Look → Authority → Decision-tick road materialization.
 *
 * Not a global sync system. Look never writes authoritative road.status.
 * Bridge only serves the current Decision Tick.
 *
 * Chain:
 *   Look hint → Evidence Trigger → Authority resolve
 *   → materialize physical / ConstraintStore / Gate inputs
 *   → Abu / CGUS / Gate bind same sourceVersion
 */

import type { RoadState } from '../models/physical-reality.model';
import type { ConstraintField } from '../../../world/constraint-field.interface';

export const LOOK_ROAD_BRIDGE_SCHEMA =
  'tripnara.look_road_decision_tick_bridge@v1' as const;

/** Look may only hint — never authoritative road SSOT */
export interface LookRoadSuspectedClosedHint {
  lookObservationId: string;
  roadId: string;
  segmentId?: string;
  tripId: string;
  /** Always false by contract */
  authoritative: false;
  predicate: 'look.field_observation';
  suspectedAt: string;
}

export type AuthorityRoadResolveOutcome =
  | {
      kind: 'RESOLVED';
      status: 'CLOSED' | 'OPEN' | 'LIMITED' | 'UNKNOWN';
      observedAt: string;
      sourceProvider: string;
      /** OFFICIAL | PARTNER | INTERNAL — never USER/LOOK */
      authority: 'OFFICIAL' | 'PARTNER' | 'INTERNAL' | 'MODEL';
      evidenceId: string;
      /** Monotonic / resolver version stamp for this authority result */
      version: string;
    }
  | {
      kind: 'UNAVAILABLE';
      attemptedAt: string;
      reason: string;
      evidenceId: string;
      version: string;
    };

export interface DecisionRoadSourceVersion {
  evidenceId: string;
  observedAt: string;
  source: string;
  authority: string;
  version: string;
}

export type DecisionTickRoadConsumerStatus =
  | 'OPEN'
  | 'CLOSED'
  | 'RESTRICTED'
  | 'UNKNOWN'
  | 'UNVERIFIED';

export type GateRoadDisposition =
  | 'ALLOW_OPEN'
  | 'BLOCK_CLOSED'
  | 'NEED_CONFIRM'
  | 'DEGRADED_UNKNOWN';

/**
 * Same-tick materialization for safety consumers.
 * All of abu / cgus / gate share `sourceVersion`.
 */
export interface DecisionTickRoadMaterialization {
  schemaId: typeof LOOK_ROAD_BRIDGE_SCHEMA;
  tickId: string;
  tripId: string;
  roadId: string;
  segmentId?: string;

  /** Look remains non-authoritative hint only */
  lookHint: LookRoadSuspectedClosedHint;

  authority: AuthorityRoadResolveOutcome;

  /** Shared version stamp — must be equal across consumers */
  sourceVersion: DecisionRoadSourceVersion;

  /** Consumer-facing status (never forged when UNAVAILABLE) */
  roadStatus: DecisionTickRoadConsumerStatus;

  gateDisposition: GateRoadDisposition;

  /** Inputs to bind for this tick only */
  physicalRoadState: RoadState;
  constraintField: ConstraintField;
  gateCanonicalRoad: {
    roadId: string;
    segmentId?: string;
    status: DecisionTickRoadConsumerStatus;
    sourceVersion: DecisionRoadSourceVersion;
  };

  abuSees: {
    road: DecisionTickRoadConsumerStatus;
    sourceVersion: DecisionRoadSourceVersion;
  };
  cgusSees: {
    road: DecisionTickRoadConsumerStatus;
    /** When UNVERIFIED/UNKNOWN, CGUS must not treat OPEN as fact */
    treatAsOpenFact: boolean;
    sourceVersion: DecisionRoadSourceVersion;
  };
  gateSees: {
    road: DecisionTickRoadConsumerStatus;
    disposition: GateRoadDisposition;
    sourceVersion: DecisionRoadSourceVersion;
  };

  hardConstraintsHonored: {
    lookNeverAuthoritativeRoadStatus: true;
    noForgedStatusOnAuthorityFailure: boolean;
    tickScopedOnly: true;
    sharedSourceVersion: true;
  };
}

export function buildLookRoadSuspectedClosedHint(input: {
  lookObservationId: string;
  roadId: string;
  tripId: string;
  segmentId?: string;
  suspectedAt?: string;
}): LookRoadSuspectedClosedHint {
  return {
    lookObservationId: input.lookObservationId,
    roadId: input.roadId.toUpperCase(),
    segmentId: input.segmentId,
    tripId: input.tripId,
    authoritative: false,
    predicate: 'look.field_observation',
    suspectedAt: input.suspectedAt ?? new Date().toISOString(),
  };
}
