/**
 * Safety World Consistency fixtures — same Decision Tick, multi-store views.
 *
 * These encode *current architectural divergence* (or aligned after fix).
 * Look path: non-authoritative by design; FAIL = consumers still diverge on External Reality.
 */

import type { DecisionTickWorldViews } from './decision-world-consistency.types';
import {
  peakWindFromWeatherEvidence,
  resolveDecisionWindSpeedMps,
} from './evidence-precedence.util';

/** T1 — Look hints road closed; Constraint/Canonical CLOSED; WMC+Abu+CGUS still OPEN */
export function fixtureRoadClosedLookDivergentTick(): DecisionTickWorldViews {
  return {
    tickId: 'T1',
    scenarioId: 'ROAD_CLOSED',
    group: 'SAFETY_EXTERNAL',
    reality: { road: 'CLOSED' },
    canonical: { road: 'CLOSED', snapshotId: 'ws_t1_road' },
    constraintStore: { road: 'CLOSED' },
    worldModelContext: { road: 'OPEN' },
    lookAssertion: {
      predicate: 'look.field_observation',
      authoritative: false,
      impliesRoadClosedHint: true,
    },
    abuSees: { road: 'OPEN' },
    cgusSees: { road: 'OPEN', windMps: null, windSource: 'absent' },
    gateSees: { road: 'CLOSED', snapshotId: 'ws_t1_road' },
    neptuneSees: { road: 'OPEN' },
  };
}

/** Aligned road CLOSED tick (target after authority resolve + snapshot bind) */
export function fixtureRoadClosedAlignedTick(): DecisionTickWorldViews {
  return {
    tickId: 'T1b',
    scenarioId: 'ROAD_CLOSED',
    group: 'SAFETY_EXTERNAL',
    reality: { road: 'CLOSED' },
    canonical: { road: 'CLOSED', snapshotId: 'ws_t1b_road' },
    constraintStore: { road: 'CLOSED' },
    worldModelContext: { road: 'CLOSED' },
    lookAssertion: {
      predicate: 'look.field_observation',
      authoritative: false,
      impliesRoadClosedHint: true,
    },
    abuSees: { road: 'CLOSED' },
    cgusSees: { road: 'CLOSED', windMps: null, windSource: 'absent' },
    gateSees: { road: 'CLOSED', snapshotId: 'ws_t1b_road' },
    neptuneSees: { road: 'CLOSED' },
  };
}

/**
 * T2 — Authority / ROR / Canonical wind 27 ORANGE;
 * legacy CGUS path would read seasonal typical 12.
 * `legacyCgus` simulates pre-precedence CGUS; use resolve for fixed path.
 */
export function fixtureStrongWindDivergentLegacyCgusTick(): DecisionTickWorldViews {
  const authorityMps = 27;
  const seasonal = 12;
  return {
    tickId: 'T2',
    scenarioId: 'STRONG_WIND',
    group: 'SAFETY_EXTERNAL',
    reality: { windMps: authorityMps, windAlert: 'ORANGE' },
    canonical: {
      windMps: authorityMps,
      windAlert: 'ORANGE',
      snapshotId: 'ws_t2_wind',
    },
    constraintStore: { weatherStressed: true },
    worldModelContext: {
      windFromSeasonalTypicalMps: seasonal,
      windFromWeatherEvidenceMps: authorityMps,
    },
    abuSees: {},
    cgusSees: {
      windMps: seasonal,
      windSource: 'seasonal_typical',
    },
    gateSees: {
      windMps: authorityMps,
      windAlert: 'ORANGE',
      snapshotId: 'ws_t2_wind',
    },
    neptuneSees: { windAlert: 'ORANGE' },
  };
}

/** Same tick after evidence precedence applied to CGUS */
export function fixtureStrongWindAlignedViaPrecedenceTick(): DecisionTickWorldViews {
  const authorityMps = 27;
  const seasonal = 12;
  const resolved = resolveDecisionWindSpeedMps({
    authorityWindMps: authorityMps,
    authorityAlertLevel: 'ORANGE',
    weatherEvidenceWindMps: authorityMps,
    seasonalTypicalWindMps: seasonal,
  });
  return {
    tickId: 'T2b',
    scenarioId: 'STRONG_WIND',
    group: 'SAFETY_EXTERNAL',
    reality: { windMps: authorityMps, windAlert: 'ORANGE' },
    canonical: {
      windMps: authorityMps,
      windAlert: 'ORANGE',
      snapshotId: 'ws_t2b_wind',
    },
    constraintStore: { weatherStressed: true },
    worldModelContext: {
      windFromSeasonalTypicalMps: seasonal,
      windFromWeatherEvidenceMps: peakWindFromWeatherEvidence([
        { windSpeedMs: authorityMps },
      ]),
    },
    abuSees: {},
    cgusSees: {
      windMps: resolved?.windSpeedMps ?? null,
      windSource:
        resolved?.band === 'SEASONAL_PRIOR'
          ? 'seasonal_typical'
          : resolved
            ? 'authority_observation'
            : 'absent',
    },
    gateSees: {
      windMps: authorityMps,
      windAlert: 'ORANGE',
      snapshotId: 'ws_t2b_wind',
    },
    neptuneSees: { windAlert: 'ORANGE' },
  };
}

/** T3 — POI temporarily closed; WMC still OPEN; Gate incomplete */
export function fixturePoiClosedDivergentTick(): DecisionTickWorldViews {
  return {
    tickId: 'T3',
    scenarioId: 'POI_CLOSED',
    group: 'SAFETY_EXTERNAL',
    reality: { poi: 'CLOSED' },
    canonical: { poi: 'OPEN', snapshotId: 'ws_t3_poi' },
    constraintStore: {},
    worldModelContext: { poi: 'OPEN' },
    abuSees: {},
    cgusSees: { windMps: null, windSource: 'absent' },
    gateSees: { poi: 'OPEN', snapshotId: 'ws_t3_poi' },
  };
}

const T3_SV = {
  evidenceId: 'ev_t3_aligned',
  observedAt: '2026-07-17T14:00:00.000Z',
  source: 'vatnajokull_trail_status',
  authority: 'OFFICIAL',
  version: 'poi-access-override@v1:ov_t3',
};

/** T3A — Authority CLOSED → Canonical / WMC / Gate aligned + shared sourceVersion */
export function fixturePoiClosedAlignedTick(): DecisionTickWorldViews {
  return {
    tickId: 'T3A',
    scenarioId: 'POI_CLOSED',
    group: 'SAFETY_EXTERNAL',
    reality: { poi: 'CLOSED' },
    canonical: {
      poi: 'CLOSED',
      snapshotId: 'ws_t3a_poi',
      poiSourceVersion: T3_SV,
    },
    constraintStore: {},
    worldModelContext: { poi: 'CLOSED', poiSourceVersion: T3_SV },
    abuSees: {},
    cgusSees: { windMps: null, windSource: 'absent' },
    gateSees: {
      poi: 'CLOSED',
      disposition: 'BLOCK_CLOSED',
      snapshotId: 'ws_t3a_poi',
      poiSourceVersion: T3_SV,
    },
    neptuneSees: { poi: 'CLOSED' },
  };
}

/** T3B — Authority OPEN (field hint non-authoritative) → OPEN everywhere */
export function fixturePoiOpenAlignedTick(): DecisionTickWorldViews {
  const sv = { ...T3_SV, evidenceId: 'ev_t3b', version: 'poi-access-override@v1:ov_t3b' };
  return {
    tickId: 'T3B',
    scenarioId: 'POI_CLOSED',
    group: 'SAFETY_EXTERNAL',
    reality: { poi: 'OPEN' },
    canonical: { poi: 'OPEN', snapshotId: 'ws_t3b_poi', poiSourceVersion: sv },
    constraintStore: {},
    worldModelContext: { poi: 'OPEN', poiSourceVersion: sv },
    abuSees: {},
    cgusSees: { windMps: null, windSource: 'absent' },
    gateSees: {
      poi: 'OPEN',
      disposition: 'ALLOW_OPEN',
      snapshotId: 'ws_t3b_poi',
      poiSourceVersion: sv,
    },
    neptuneSees: { poi: 'OPEN' },
  };
}

/** T3C — Authority UNAVAILABLE → UNVERIFIED (no forge OPEN/CLOSED) */
export function fixturePoiUnverifiedAlignedTick(): DecisionTickWorldViews {
  const sv = {
    evidenceId: 'ev_t3c',
    observedAt: '2026-07-17T14:10:00.000Z',
    source: 'authority_unavailable',
    authority: 'UNVERIFIED',
    version: 'poi-access-override@v1:unavailable',
  };
  return {
    tickId: 'T3C',
    scenarioId: 'POI_CLOSED',
    group: 'SAFETY_EXTERNAL',
    reality: { poi: 'UNVERIFIED' },
    canonical: {
      poi: 'UNVERIFIED',
      snapshotId: 'ws_t3c_poi',
      poiSourceVersion: sv,
    },
    constraintStore: {},
    worldModelContext: { poi: 'UNVERIFIED', poiSourceVersion: sv },
    abuSees: {},
    cgusSees: { windMps: null, windSource: 'absent' },
    gateSees: {
      poi: 'UNVERIFIED',
      disposition: 'NEED_CONFIRM',
      snapshotId: 'ws_t3c_poi',
      poiSourceVersion: sv,
    },
    neptuneSees: { poi: 'UNVERIFIED' },
  };
}
