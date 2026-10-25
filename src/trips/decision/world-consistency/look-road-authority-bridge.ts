/**
 * Look hint → authority outcome → same-tick decision inputs.
 *
 * Hard constraints:
 * 1. Look never writes authoritative road.status
 * 2. Authority UNAVAILABLE → UNKNOWN/UNVERIFIED (never forge OPEN/CLOSED)
 * 3. Tick-scoped materialization only (no global bidirectional sync)
 * 4. One authority result → one shared sourceVersion for Abu/CGUS/Gate
 */

import type { ConstraintField } from '../../../world/constraint-field.interface';
import type { RoadState } from '../models/physical-reality.model';
import type {
  AuthorityRoadResolveOutcome,
  DecisionRoadSourceVersion,
  DecisionTickRoadConsumerStatus,
  DecisionTickRoadMaterialization,
  GateRoadDisposition,
  LookRoadSuspectedClosedHint,
} from './look-road-authority-bridge.types';
import { LOOK_ROAD_BRIDGE_SCHEMA } from './look-road-authority-bridge.types';

function mapAuthorityStatusToConsumer(
  status: 'CLOSED' | 'OPEN' | 'LIMITED' | 'UNKNOWN',
): DecisionTickRoadConsumerStatus {
  if (status === 'CLOSED') return 'CLOSED';
  if (status === 'OPEN') return 'OPEN';
  if (status === 'LIMITED') return 'RESTRICTED';
  return 'UNKNOWN';
}

function mapToPhysicalStatus(
  status: DecisionTickRoadConsumerStatus,
): RoadState['status'] {
  if (status === 'CLOSED') return 'CLOSED';
  if (status === 'OPEN') return 'OPEN';
  if (status === 'RESTRICTED') return 'RESTRICTED';
  // UNKNOWN / UNVERIFIED → do not claim OPEN or CLOSED
  return 'RESTRICTED';
}

function mapConstraintState(
  status: DecisionTickRoadConsumerStatus,
): ConstraintField['state'] {
  if (status === 'CLOSED') return 'CLOSED';
  if (status === 'OPEN') return 'OPEN';
  if (status === 'RESTRICTED') return 'RESTRICTED';
  return 'UNKNOWN';
}

function buildSourceVersion(
  authority: AuthorityRoadResolveOutcome,
): DecisionRoadSourceVersion {
  if (authority.kind === 'UNAVAILABLE') {
    return {
      evidenceId: authority.evidenceId,
      observedAt: authority.attemptedAt,
      source: 'authority_unavailable',
      authority: 'UNVERIFIED',
      version: authority.version,
    };
  }
  return {
    evidenceId: authority.evidenceId,
    observedAt: authority.observedAt,
    source: authority.sourceProvider,
    authority: authority.authority,
    version: authority.version,
  };
}

function assertLookNonAuthoritative(hint: LookRoadSuspectedClosedHint): void {
  if (hint.authoritative !== false) {
    throw new Error('LookRoadSuspectedClosedHint.authoritative must be false');
  }
  if (hint.predicate !== 'look.field_observation') {
    throw new Error(
      'Look must use look.field_observation; never road.status',
    );
  }
}

/**
 * Materialize authority road conclusion into current Decision Tick inputs.
 * Does not persist globally; caller binds outputs into this tick's consumers.
 */
export function materializeLookRoadAuthorityForDecisionTick(input: {
  tickId: string;
  lookHint: LookRoadSuspectedClosedHint;
  authority: AuthorityRoadResolveOutcome;
  /** Wall clock for constraint field timestamps when resolved */
  atMs?: number;
}): DecisionTickRoadMaterialization {
  assertLookNonAuthoritative(input.lookHint);

  const roadId = input.lookHint.roadId.toUpperCase();
  const sourceVersion = buildSourceVersion(input.authority);
  void input.atMs; // reserved for callers that stamp ConstraintStore.upsert

  let roadStatus: DecisionTickRoadConsumerStatus;
  let gateDisposition: GateRoadDisposition;
  let noForged = true;

  if (input.authority.kind === 'UNAVAILABLE') {
    roadStatus = 'UNVERIFIED';
    gateDisposition = 'NEED_CONFIRM';
    noForged = true;
  } else {
    roadStatus = mapAuthorityStatusToConsumer(input.authority.status);
    if (roadStatus === 'CLOSED') gateDisposition = 'BLOCK_CLOSED';
    else if (roadStatus === 'OPEN') gateDisposition = 'ALLOW_OPEN';
    else if (roadStatus === 'UNKNOWN') {
      gateDisposition = 'NEED_CONFIRM';
    } else {
      gateDisposition = 'DEGRADED_UNKNOWN';
    }
  }

  const physicalStatus =
    roadStatus === 'UNVERIFIED' || roadStatus === 'UNKNOWN'
      ? ('RESTRICTED' as const) // physical enum has no UNKNOWN; RESTRICTED ≠ OPEN/CLOSED forge
      : mapToPhysicalStatus(roadStatus);

  const physicalRoadState: RoadState = {
    roadId,
    status: physicalStatus,
    segmentId: input.lookHint.segmentId,
    metadata: {
      decisionTickId: input.tickId,
      sourceVersion,
      lookHintId: input.lookHint.lookObservationId,
      lookAuthoritative: false,
      consumerStatus: roadStatus,
    },
  };

  const constraintField: ConstraintField = {
    id: roadId,
    type: 'ROAD',
    state: mapConstraintState(roadStatus),
    severity: roadStatus === 'CLOSED' ? 100 : roadStatus === 'OPEN' ? 0 : 40,
    impactWeight: roadStatus === 'CLOSED' ? 1 : roadStatus === 'OPEN' ? 0 : 0.4,
    version: 0,
    temporalScope: {
      start: sourceVersion.observedAt,
      end: sourceVersion.observedAt,
    },
  };

  const treatAsOpenFact = roadStatus === 'OPEN';

  const abuSees = { road: roadStatus, sourceVersion };
  const cgusSees = {
    road: roadStatus,
    treatAsOpenFact,
    sourceVersion,
  };
  const gateSees = {
    road: roadStatus,
    disposition: gateDisposition,
    sourceVersion,
  };

  return {
    schemaId: LOOK_ROAD_BRIDGE_SCHEMA,
    tickId: input.tickId,
    tripId: input.lookHint.tripId,
    roadId,
    segmentId: input.lookHint.segmentId,
    lookHint: input.lookHint,
    authority: input.authority,
    sourceVersion,
    roadStatus,
    gateDisposition,
    physicalRoadState,
    constraintField,
    gateCanonicalRoad: {
      roadId,
      segmentId: input.lookHint.segmentId,
      status: roadStatus,
      sourceVersion,
    },
    abuSees,
    cgusSees,
    gateSees,
    hardConstraintsHonored: {
      lookNeverAuthoritativeRoadStatus: true,
      noForgedStatusOnAuthorityFailure: noForged,
      tickScopedOnly: true,
      sharedSourceVersion: true,
    },
  };
}

/** Acceptance: Abu/CGUS/Gate share identical sourceVersion fingerprint */
export function assertSharedRoadSourceVersion(
  m: DecisionTickRoadMaterialization,
): boolean {
  const a = JSON.stringify(m.abuSees.sourceVersion);
  const c = JSON.stringify(m.cgusSees.sourceVersion);
  const g = JSON.stringify(m.gateSees.sourceVersion);
  return a === c && c === g && a === JSON.stringify(m.sourceVersion);
}

/**
 * Overlay authority road into a physical.roadStates array for this tick.
 * Replaces same roadId; does not sync other stores.
 */
export function bindPhysicalRoadStatesForTick(
  existing: RoadState[] | undefined,
  materialization: DecisionTickRoadMaterialization,
): RoadState[] {
  const rest = (existing ?? []).filter(
    (r) => r.roadId.toUpperCase() !== materialization.roadId,
  );
  return [...rest, materialization.physicalRoadState];
}
