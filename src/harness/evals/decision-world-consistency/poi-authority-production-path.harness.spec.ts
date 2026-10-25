/**
 * P0-3: PoiAccessOverrideAuthorityPort → tick binding → Gate / WMC / Canonical.
 */

import { DecisionTickPoiBindingStore } from '../../../trips/decision/world-consistency/decision-tick-poi-binding.store';
import { PoiAuthorityDecisionTickService } from '../../../trips/decision/world-consistency/poi-authority-decision-tick.service';
import {
  PoiAccessOverrideAuthorityPort,
  type PoiAccessOverrideLookup,
} from '../../../trips/decision/world-consistency/poi-access-override-authority.port';
import {
  assertSharedPoiSourceVersion,
} from '../../../trips/decision/world-consistency/poi-authority-bridge';
import { bindPoiAuthorityIntoWorldModelContext } from '../../../trips/decision/world-consistency/bind-poi-into-world-model-context.util';
import { bindPoiAuthorityIntoCanonicalSnapshot } from '../../../trips/decision/world-consistency/bind-poi-into-canonical-snapshot.util';
import { DecisionTickPoiGateProvider } from '../../../trips/decision/world-consistency/decision-tick-poi-gate.provider';
import { evaluateDecisionTickConsistency } from './evaluate-decision-tick-consistency.util';
import { projectPoiBridgeToTickViews } from './project-poi-bridge-to-tick-views.util';
import type { WorldModelContext } from '../../../trips/decision/shared/world-model.types';
import type { CanonicalWorldStateSnapshot } from '../../../decision-runtime/contracts/world-state-snapshot';
import type { PoiAccessStatusOverride } from '../../../poi-access-capacity/interfaces/poi-access-capacity.interface';

const TRIP = 'trip_poi_prod';
const POI = 'is.skaftafell';

function stubWorld(): WorldModelContext {
  return {
    physical: {
      demEvidence: [
        {
          segmentId: 'seg',
          elevationProfile: [0],
          cumulativeAscent: 0,
          maxSlopePct: 0,
          rollingAscent3Days: 0,
          fatigueIndex: 0,
          violation: 'NONE',
          explanation: 'stub',
        },
      ],
      roadStates: [],
      hazardZones: [],
      ferryStates: [],
      countryCode: 'IS',
      month: 7,
      poiOperationalStates: [{ poiId: POI, open: true, status: 'OPEN' }],
    },
    human: {
      maxDailyAscentM: 800,
      rollingAscent3DaysM: 2000,
      maxSlopePct: 20,
      riskTolerance: 'MEDIUM',
      preferredPace: 'MEDIUM',
    } as WorldModelContext['human'],
    routeDirection: { id: 'rd', name: 'South Coast' } as WorldModelContext['routeDirection'],
  };
}

function stubCanonical(open = true): CanonicalWorldStateSnapshot {
  return {
    snapshotId: 'ws_stub',
    tripId: TRIP,
    capturedAt: '2026-07-17T14:00:00.000Z',
    completeness: {
      roads: 'COMPLETE',
      weather: 'COMPLETE',
      hazards: 'COMPLETE',
      ferries: 'COMPLETE',
      openingHours: 'COMPLETE',
      travelTime: 'COMPLETE',
    },
    weatherByDate: [],
    roadStates: [],
    hazardStates: [],
    ferryStates: [],
    poiStates: [{ poiId: POI, open, sourceRef: 'stub' }],
  } as CanonicalWorldStateSnapshot;
}

function closedOverride(): PoiAccessStatusOverride {
  return {
    id: 'ov_closed',
    poiId: POI,
    ruleType: 'CLOSED',
    targetResource: 'POI',
    effectiveFrom: '2026-07-01T00:00:00.000Z',
    status: 'ACTIVE',
    sourceAuthority: 'vatnajokull_trail_status',
    lastVerifiedAt: new Date().toISOString(),
    confidence: 'OFFICIAL',
  };
}

function openOverride(): PoiAccessStatusOverride {
  return {
    ...closedOverride(),
    id: 'ov_open',
    ruleType: 'TIME_WINDOW',
  };
}

function makeSvc(override: PoiAccessStatusOverride | null) {
  const store = new DecisionTickPoiBindingStore();
  const lookup: PoiAccessOverrideLookup = {
    findActiveOverride: async () => override,
  };
  const port = new PoiAccessOverrideAuthorityPort(lookup);
  const svc = new PoiAuthorityDecisionTickService(store, port);
  const gate = new DecisionTickPoiGateProvider(store);
  return { store, svc, gate };
}

describe('P0-3 POI authority production path', () => {
  it('A: ACTIVE CLOSED override → WMC/Canonical CLOSED + Gate BLOCK + consistency PASS', async () => {
    const { svc, gate } = makeSvc(closedOverride());
    const m = await svc.maybeTriggerForPoi({
      tripId: TRIP,
      poiId: POI,
      tickId: 'tick_poi_a',
      observationId: 'obs_hint',
    });
    expect(m).not.toBeNull();
    expect(assertSharedPoiSourceVersion(m!)).toBe(true);

    const world = bindPoiAuthorityIntoWorldModelContext(stubWorld(), m!);
    expect(world.physical.poiOperationalStates?.[0]?.open).toBe(false);
    expect(world.physical.poiOperationalStates?.[0]?.status).toBe('CLOSED');

    const snap = bindPoiAuthorityIntoCanonicalSnapshot(stubCanonical(true), m!);
    expect(snap.poiStates.find((p) => p.poiId === POI)?.open).toBe(false);

    const assertions = gate.evaluate({ tripId: TRIP });
    expect(assertions[0]?.status).toBe('BLOCK');

    const report = evaluateDecisionTickConsistency(
      projectPoiBridgeToTickViews({
        materialization: m!,
        realityPoi: 'CLOSED',
      }),
    );
    expect(report.overall).toBe('PASS');
  });

  it('B: ACTIVE non-closure → OPEN (hint does not seal CLOSED)', async () => {
    const { svc, gate } = makeSvc(openOverride());
    const m = await svc.maybeTriggerForPoi({
      tripId: TRIP,
      poiId: POI,
      tickId: 'tick_poi_b',
      observationId: 'obs_hint',
    });
    expect(m!.poiStatus).toBe('OPEN');
    expect(gate.evaluate({ tripId: TRIP })[0]?.status).toBe('PASS');
    expect(
      evaluateDecisionTickConsistency(
        projectPoiBridgeToTickViews({
          materialization: m!,
          realityPoi: 'OPEN',
        }),
      ).overall,
    ).toBe('PASS');
  });

  it('C: empty override → UNVERIFIED / NEED_CONFIRM', async () => {
    const { svc, gate } = makeSvc(null);
    const m = await svc.maybeTriggerForPoi({
      tripId: TRIP,
      poiId: POI,
      tickId: 'tick_poi_c',
    });
    expect(m!.poiStatus).toBe('UNVERIFIED');
    expect(m!.physicalPoiState.open).toBeNull();
    expect(gate.evaluate({ tripId: TRIP })[0]?.status).toBe(
      'REQUIRES_VERIFICATION',
    );
    expect(
      evaluateDecisionTickConsistency(
        projectPoiBridgeToTickViews({
          materialization: m!,
          realityPoi: 'UNVERIFIED',
        }),
      ).overall,
    ).toBe('PASS');
  });
});
