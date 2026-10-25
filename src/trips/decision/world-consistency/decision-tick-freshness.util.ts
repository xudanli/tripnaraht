/**
 * Tick binding freshness — Temporal Correctness (minimal).
 *
 * Stale authority must not keep sealing Gate BLOCK/PASS.
 * Degrade to NEED_CONFIRM / UNVERIFIED — never forge the opposite OPEN/CLOSED.
 */

import type { DecisionTickRoadMaterialization } from './look-road-authority-bridge.types';
import type { DecisionTickPoiMaterialization } from './poi-authority-bridge.types';

/** Align with RoadStatusRealtimeService cache band (15m). */
export const DECISION_TICK_ROAD_FRESHNESS_TTL_MS = 15 * 60 * 1000;

/** POI override freshness band (30m). */
export const DECISION_TICK_POI_FRESHNESS_TTL_MS = 30 * 60 * 1000;

export function isDecisionTickSourceStale(input: {
  observedAt: string;
  nowMs?: number;
  ttlMs: number;
}): boolean {
  const observed = Date.parse(input.observedAt);
  if (Number.isNaN(observed)) return true;
  const now = input.nowMs ?? Date.now();
  return now - observed > input.ttlMs;
}

export function applyRoadTickFreshness(
  m: DecisionTickRoadMaterialization,
  opts?: { nowMs?: number; ttlMs?: number },
): DecisionTickRoadMaterialization {
  const ttlMs = opts?.ttlMs ?? DECISION_TICK_ROAD_FRESHNESS_TTL_MS;
  const stale = isDecisionTickSourceStale({
    observedAt: m.sourceVersion.observedAt,
    nowMs: opts?.nowMs,
    ttlMs,
  });
  if (!stale) return m;
  // Idempotent: already degraded by a prior freshness pass
  if (m.sourceVersion.version.endsWith(':stale')) return m;

  const sourceVersion = {
    ...m.sourceVersion,
    authority: 'UNVERIFIED',
    version: `${m.sourceVersion.version}:stale`,
  };

  return {
    ...m,
    roadStatus: 'UNVERIFIED',
    gateDisposition: 'NEED_CONFIRM',
    sourceVersion,
    abuSees: { road: 'UNVERIFIED', sourceVersion },
    cgusSees: {
      road: 'UNVERIFIED',
      treatAsOpenFact: false,
      sourceVersion,
    },
    gateSees: {
      road: 'UNVERIFIED',
      disposition: 'NEED_CONFIRM',
      sourceVersion,
    },
    gateCanonicalRoad: {
      ...m.gateCanonicalRoad,
      status: 'UNVERIFIED',
      sourceVersion,
    },
    hardConstraintsHonored: {
      ...m.hardConstraintsHonored,
      noForgedStatusOnAuthorityFailure: true,
    },
  };
}

export function applyPoiTickFreshness(
  m: DecisionTickPoiMaterialization,
  opts?: { nowMs?: number; ttlMs?: number },
): DecisionTickPoiMaterialization {
  const ttlMs = opts?.ttlMs ?? DECISION_TICK_POI_FRESHNESS_TTL_MS;
  const stale = isDecisionTickSourceStale({
    observedAt: m.sourceVersion.observedAt,
    nowMs: opts?.nowMs,
    ttlMs,
  });
  if (!stale) return m;
  // Idempotent: already degraded by a prior freshness pass
  if (m.sourceVersion.version.endsWith(':stale')) return m;

  const sourceVersion = {
    ...m.sourceVersion,
    authority: 'UNVERIFIED',
    version: `${m.sourceVersion.version}:stale`,
  };

  return {
    ...m,
    poiStatus: 'UNVERIFIED',
    gateDisposition: 'NEED_CONFIRM',
    sourceVersion,
    canonicalPoiState: {
      ...m.canonicalPoiState,
      open: undefined,
      sourceRef: `${sourceVersion.source}:${sourceVersion.evidenceId}:stale`,
    },
    physicalPoiState: {
      ...m.physicalPoiState,
      open: null,
      status: 'UNVERIFIED',
      metadata: {
        ...m.physicalPoiState.metadata,
        sourceVersion,
        stale: true,
      },
    },
    gateCanonicalPoi: {
      poiId: m.poiId,
      status: 'UNVERIFIED',
      sourceVersion,
    },
    gateSees: {
      poi: 'UNVERIFIED',
      disposition: 'NEED_CONFIRM',
      sourceVersion,
    },
    worldSees: { poi: 'UNVERIFIED', sourceVersion },
    canonicalSees: { poi: 'UNVERIFIED', sourceVersion },
    hardConstraintsHonored: {
      ...m.hardConstraintsHonored,
      noForgedStatusOnAuthorityFailure: true,
    },
  };
}
