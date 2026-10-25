/**
 * Shadow Decision Impact + Temporal Correctness (freshness).
 *
 * Scientist gate: if bridge deleted, does Gate/CGUS/WMC outcome change?
 */

import { DecisionTickRoadBindingStore } from '../../../trips/decision/world-consistency/decision-tick-road-binding.store';
import { LookRoadAuthorityDecisionTickService } from '../../../trips/decision/world-consistency/look-road-authority-decision-tick.service';
import { PoiAuthorityDecisionTickService } from '../../../trips/decision/world-consistency/poi-authority-decision-tick.service';
import { DecisionTickPoiBindingStore } from '../../../trips/decision/world-consistency/decision-tick-poi-binding.store';
import {
  PoiAccessOverrideAuthorityPort,
  type PoiAccessOverrideLookup,
} from '../../../trips/decision/world-consistency/poi-access-override-authority.port';
import {
  applyRoadTickFreshness,
  applyPoiTickFreshness,
  DECISION_TICK_ROAD_FRESHNESS_TTL_MS,
} from '../../../trips/decision/world-consistency/decision-tick-freshness.util';
import { materializeLookRoadAuthorityForDecisionTick } from '../../../trips/decision/world-consistency/look-road-authority-bridge';
import { buildLookRoadSuspectedClosedHint } from '../../../trips/decision/world-consistency/look-road-authority-bridge.types';
import { materializePoiAuthorityForDecisionTick } from '../../../trips/decision/world-consistency/poi-authority-bridge';
import { buildDecisionTickRoadGateAssertions } from '../../../trips/decision/world-consistency/build-decision-tick-road-gate-assertions.util';
import type { LookRoadAuthorityPort } from '../../../trips/decision/world-consistency/run-look-road-authority-decision-tick';
import type { PoiAccessStatusOverride } from '../../../poi-access-capacity/interfaces/poi-access-capacity.interface';
import {
  formatDecisionImpactReport,
  measurePoiClosedDecisionImpact,
  measureRoadClosedDecisionImpact,
} from './measure-decision-impact.util';

const TRIP = 'trip_impact_shadow';
const ROAD = 'F208';
const POI = 'is.skaftafell';

describe('Decision Impact shadow (scientist gate)', () => {
  it('Road CLOSED: deleting bridge would change Gate BLOCK + CGUS feasible', async () => {
    const store = new DecisionTickRoadBindingStore();
    const port: LookRoadAuthorityPort = {
      resolveAuthority: async () => ({
        kind: 'RESOLVED',
        status: 'CLOSED',
        observedAt: new Date().toISOString(),
        sourceProvider: 'vegagerdin_gagnaveita',
        authority: 'OFFICIAL',
        evidenceId: 'ev_impact_road',
        version: 'impactRoad',
      }),
    };
    const svc = new LookRoadAuthorityDecisionTickService(store, port as never);
    await svc.maybeTriggerFromLookObservation({
      tripId: TRIP,
      observationId: 'obs_impact',
      facts: [
        {
          semanticType: 'OBSERVATION',
          semanticKey: 'OBSERVATION.ROAD.CLOSED_SIGN_DETECTED',
          value: ROAD,
          confidence: 0.9,
          source: 'OCR',
        },
      ],
      tickId: 'tick_impact_road',
    });

    const binding = store.getLatestBinding(TRIP)!;
    const report = measureRoadClosedDecisionImpact({ binding });
    // eslint-disable-next-line no-console
    console.log(formatDecisionImpactReport(report).join('\n'));

    expect(report.withoutBridge.gateBlocks).toBe(false);
    expect(report.withoutBridge.cgusFeasible).toBe(true);
    expect(report.withoutBridge.worldSees).toBe('OPEN');
    expect(report.withBridge.gateBlocks).toBe(true);
    expect(report.withBridge.cgusFeasible).toBe(false);
    expect(report.withBridge.worldSees).toBe('CLOSED');
    expect(report.decisionWouldDifferIfBridgeDeleted).toBe(true);
  });

  it('POI CLOSED: deleting bridge would change Gate BLOCK + WMC', async () => {
    const store = new DecisionTickPoiBindingStore();
    const override: PoiAccessStatusOverride = {
      id: 'ov_impact',
      poiId: POI,
      ruleType: 'CLOSED',
      targetResource: 'POI',
      effectiveFrom: '2026-07-01T00:00:00.000Z',
      status: 'ACTIVE',
      sourceAuthority: 'vatnajokull_trail_status',
      lastVerifiedAt: new Date().toISOString(),
      confidence: 'OFFICIAL',
    };
    const lookup: PoiAccessOverrideLookup = {
      findActiveOverride: async () => override,
    };
    const port = new PoiAccessOverrideAuthorityPort(lookup);
    const svc = new PoiAuthorityDecisionTickService(store, port);
    const m = await svc.maybeTriggerForPoi({
      tripId: TRIP,
      poiId: POI,
      tickId: 'tick_impact_poi',
    });

    const report = measurePoiClosedDecisionImpact({ materialization: m! });
    // eslint-disable-next-line no-console
    console.log(formatDecisionImpactReport(report).join('\n'));

    expect(report.withoutBridge.gateBlocks).toBe(false);
    expect(report.withoutBridge.worldSees).toBe('OPEN');
    expect(report.withBridge.gateBlocks).toBe(true);
    expect(report.withBridge.worldSees).toBe('CLOSED');
    expect(report.decisionWouldDifferIfBridgeDeleted).toBe(true);
  });
});

describe('Temporal Correctness — tick freshness', () => {
  it('stale road CLOSED → Gate NEED_CONFIRM (not sealed BLOCK)', () => {
    const observedAt = new Date(
      Date.now() - DECISION_TICK_ROAD_FRESHNESS_TTL_MS - 60_000,
    ).toISOString();
    const fresh = materializeLookRoadAuthorityForDecisionTick({
      tickId: 'tick_stale_road',
      lookHint: buildLookRoadSuspectedClosedHint({
        lookObservationId: 'obs_stale',
        roadId: ROAD,
        tripId: TRIP,
      }),
      authority: {
        kind: 'RESOLVED',
        status: 'CLOSED',
        observedAt,
        sourceProvider: 'vegagerdin_gagnaveita',
        authority: 'OFFICIAL',
        evidenceId: 'ev_stale',
        version: 'staleV',
      },
    });

    expect(fresh.gateDisposition).toBe('BLOCK_CLOSED');
    const aged = applyRoadTickFreshness(fresh, { nowMs: Date.now() });
    expect(aged.gateDisposition).toBe('NEED_CONFIRM');
    expect(aged.roadStatus).toBe('UNVERIFIED');
    expect(aged.sourceVersion.version).toContain(':stale');

    const assertions = buildDecisionTickRoadGateAssertions(aged);
    expect(assertions[0]?.status).toBe('REQUIRES_VERIFICATION');
    expect(assertions[0]?.reasonCode).toBe('DECISION_TICK_ROAD_UNVERIFIED');
  });

  it('fresh road CLOSED stays BLOCK', () => {
    const m = materializeLookRoadAuthorityForDecisionTick({
      tickId: 'tick_fresh_road',
      lookHint: buildLookRoadSuspectedClosedHint({
        lookObservationId: 'obs_fresh',
        roadId: ROAD,
        tripId: TRIP,
      }),
      authority: {
        kind: 'RESOLVED',
        status: 'CLOSED',
        observedAt: new Date().toISOString(),
        sourceProvider: 'vegagerdin_gagnaveita',
        authority: 'OFFICIAL',
        evidenceId: 'ev_fresh',
        version: 'freshV',
      },
    });
    const aged = applyRoadTickFreshness(m, { nowMs: Date.now() });
    expect(aged.gateDisposition).toBe('BLOCK_CLOSED');
  });

  it('stale POI CLOSED → NEED_CONFIRM', () => {
    const m = materializePoiAuthorityForDecisionTick({
      tickId: 'tick_stale_poi',
      tripId: TRIP,
      poiId: POI,
      authority: {
        kind: 'RESOLVED',
        status: 'CLOSED',
        observedAt: '2020-01-01T00:00:00.000Z',
        sourceProvider: 'vatnajokull_trail_status',
        authority: 'OFFICIAL',
        evidenceId: 'ev_poi_stale',
        version: 'poiStale',
      },
    });
    const aged = applyPoiTickFreshness(m, { nowMs: Date.now() });
    expect(aged.gateDisposition).toBe('NEED_CONFIRM');
    expect(aged.poiStatus).toBe('UNVERIFIED');
    expect(aged.physicalPoiState.open).toBeNull();
  });
});
