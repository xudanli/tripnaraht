/**
 * Authority POI outcome → same-tick decision inputs.
 *
 * Hard constraints:
 * 1. Field/Look hint never writes authoritative POI open/closed
 * 2. Authority UNAVAILABLE → UNVERIFIED (never forge OPEN/CLOSED)
 * 3. Tick-scoped only (no global bidirectional sync)
 * 4. One authority result → one shared sourceVersion
 */

import type {
  AuthorityPoiResolveOutcome,
  DecisionPoiSourceVersion,
  DecisionTickPoiConsumerStatus,
  DecisionTickPoiMaterialization,
  GatePoiDisposition,
  PoiSuspectedClosedHint,
} from './poi-authority-bridge.types';
import { POI_AUTHORITY_BRIDGE_SCHEMA } from './poi-authority-bridge.types';

function mapAuthorityStatusToConsumer(
  status: 'CLOSED' | 'OPEN' | 'LIMITED' | 'UNKNOWN',
): DecisionTickPoiConsumerStatus {
  if (status === 'CLOSED') return 'CLOSED';
  if (status === 'OPEN') return 'OPEN';
  if (status === 'LIMITED') return 'RESTRICTED';
  return 'UNKNOWN';
}

function buildSourceVersion(
  authority: AuthorityPoiResolveOutcome,
): DecisionPoiSourceVersion {
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

function assertHintNonAuthoritative(
  hint: PoiSuspectedClosedHint | undefined,
): void {
  if (!hint) return;
  if (hint.authoritative !== false) {
    throw new Error('PoiSuspectedClosedHint.authoritative must be false');
  }
  if (hint.predicate !== 'poi.field_observation') {
    throw new Error(
      'POI field hint must use poi.field_observation; never seal open/closed',
    );
  }
}

function openFlag(
  status: DecisionTickPoiConsumerStatus,
): boolean | null {
  if (status === 'OPEN') return true;
  if (status === 'CLOSED') return false;
  // UNVERIFIED / UNKNOWN / RESTRICTED — do not forge boolean open
  return null;
}

export function materializePoiAuthorityForDecisionTick(input: {
  tickId: string;
  tripId: string;
  poiId: string;
  authority: AuthorityPoiResolveOutcome;
  fieldHint?: PoiSuspectedClosedHint;
}): DecisionTickPoiMaterialization {
  assertHintNonAuthoritative(input.fieldHint);

  const poiId = input.poiId.trim().toLowerCase();
  const sourceVersion = buildSourceVersion(input.authority);

  let poiStatus: DecisionTickPoiConsumerStatus;
  let gateDisposition: GatePoiDisposition;
  let noForged = true;

  if (input.authority.kind === 'UNAVAILABLE') {
    poiStatus = 'UNVERIFIED';
    gateDisposition = 'NEED_CONFIRM';
  } else {
    poiStatus = mapAuthorityStatusToConsumer(input.authority.status);
    if (poiStatus === 'CLOSED') gateDisposition = 'BLOCK_CLOSED';
    else if (poiStatus === 'OPEN') gateDisposition = 'ALLOW_OPEN';
    else if (poiStatus === 'UNKNOWN') gateDisposition = 'NEED_CONFIRM';
    else gateDisposition = 'DEGRADED_UNKNOWN';
  }

  const open = openFlag(poiStatus);

  const canonicalPoiState = {
    poiId,
    open: open === null ? undefined : open,
    validFrom: sourceVersion.observedAt,
    sourceRef: `${sourceVersion.source}:${sourceVersion.evidenceId}`,
  };

  const physicalPoiState = {
    poiId,
    open,
    status: poiStatus,
    metadata: {
      decisionTickId: input.tickId,
      sourceVersion,
      fieldHintAuthoritative: false,
    },
  };

  const shared = {
    poi: poiStatus,
    sourceVersion,
  };

  return {
    schemaId: POI_AUTHORITY_BRIDGE_SCHEMA,
    tickId: input.tickId,
    tripId: input.tripId,
    poiId,
    fieldHint: input.fieldHint,
    authority: input.authority,
    sourceVersion,
    poiStatus,
    gateDisposition,
    canonicalPoiState,
    physicalPoiState,
    gateCanonicalPoi: {
      poiId,
      status: poiStatus,
      sourceVersion,
    },
    gateSees: {
      poi: poiStatus,
      disposition: gateDisposition,
      sourceVersion,
    },
    worldSees: shared,
    canonicalSees: shared,
    hardConstraintsHonored: {
      fieldHintNeverAuthoritative: true,
      noForgedStatusOnAuthorityFailure: noForged,
      tickScopedOnly: true,
      sharedSourceVersion: true,
    },
  };
}

export function assertSharedPoiSourceVersion(
  m: DecisionTickPoiMaterialization,
): boolean {
  const g = JSON.stringify(m.gateSees.sourceVersion);
  const w = JSON.stringify(m.worldSees.sourceVersion);
  const c = JSON.stringify(m.canonicalSees.sourceVersion);
  return g === w && w === c && g === JSON.stringify(m.sourceVersion);
}

export function bindCanonicalPoiStatesForTick(
  existing: Array<{ poiId: string; open?: boolean; sourceRef?: string }> | undefined,
  materialization: DecisionTickPoiMaterialization,
): Array<{ poiId: string; open?: boolean; sourceRef?: string }> {
  const rest = (existing ?? []).filter(
    (p) => p.poiId.toLowerCase() !== materialization.poiId,
  );
  return [...rest, materialization.canonicalPoiState];
}

export function bindPhysicalPoiStatesForTick(
  existing:
    | Array<{
        poiId: string;
        open: boolean | null;
        status: DecisionTickPoiConsumerStatus;
        metadata?: Record<string, unknown>;
      }>
    | undefined,
  materialization: DecisionTickPoiMaterialization,
): Array<{
  poiId: string;
  open: boolean | null;
  status: DecisionTickPoiConsumerStatus;
  metadata?: Record<string, unknown>;
}> {
  const rest = (existing ?? []).filter(
    (p) => p.poiId.toLowerCase() !== materialization.poiId,
  );
  return [...rest, materialization.physicalPoiState];
}
