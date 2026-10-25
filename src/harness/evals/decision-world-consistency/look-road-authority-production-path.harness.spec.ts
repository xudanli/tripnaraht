/**
 * P0-1 production-path integration: Look hint → authority port → tick binding →
 * WorldModelContext bind → same-tick consistency A/B/C.
 */

import { DecisionTickRoadBindingStore } from '../../../trips/decision/world-consistency/decision-tick-road-binding.store';
import { LookRoadAuthorityDecisionTickService } from '../../../trips/decision/world-consistency/look-road-authority-decision-tick.service';
import { bindLookRoadAuthorityIntoWorldModelContext } from '../../../trips/decision/world-consistency/bind-look-road-into-world-model-context.util';
import { assertSharedRoadSourceVersion } from '../../../trips/decision/world-consistency/look-road-authority-bridge';
import type { LookRoadAuthorityPort } from '../../../trips/decision/world-consistency/run-look-road-authority-decision-tick';
import type { AuthorityRoadResolveOutcome } from '../../../trips/decision/world-consistency/look-road-authority-bridge.types';
import type { WorldModelContext } from '../../../trips/decision/shared/world-model.types';
import { evaluateDecisionTickConsistency } from './evaluate-decision-tick-consistency.util';
import { projectRoadBridgeToTickViews } from './project-road-bridge-to-tick-views.util';

function stubWorld(roadStatus: 'OPEN' | 'CLOSED'): WorldModelContext {
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
      roadStates: [{ roadId: 'F208', status: roadStatus }],
      hazardZones: [],
      ferryStates: [],
      countryCode: 'IS',
      month: 7,
    },
    human: {
      maxDailyAscentM: 800,
      rollingAscent3DaysM: 2000,
      maxSlopePct: 20,
      riskTolerance: 'MEDIUM',
      preferredPace: 'MEDIUM',
    } as WorldModelContext['human'],
    routeDirection: {
      id: 'rd',
      name: 'stub',
    } as WorldModelContext['routeDirection'],
  };
}

function mockPort(
  outcome: AuthorityRoadResolveOutcome,
): LookRoadAuthorityPort {
  return {
    resolveAuthority: async () => outcome,
  };
}

describe('P0-1 Look→Authority production path (integration)', () => {
  const factsClosed = [
    {
      semanticType: 'OBSERVATION' as const,
      semanticKey: 'OBSERVATION.ROAD.CLOSED_SIGN_DETECTED',
      value: 'F208',
      confidence: 0.9,
      source: 'OCR' as const,
    },
  ];

  async function runWithAuthority(authority: AuthorityRoadResolveOutcome) {
    const store = new DecisionTickRoadBindingStore();
    const port = mockPort(authority);
    const svc = new LookRoadAuthorityDecisionTickService(
      store,
      port as never,
    );
    const m = await svc.maybeTriggerFromLookObservation({
      tripId: 'trip_prod',
      observationId: 'obs_1',
      facts: factsClosed,
      tickId: `tick_${authority.kind}_${'status' in authority ? authority.status : 'NA'}`,
    });
    expect(m).not.toBeNull();
    expect(store.getLatest('trip_prod')).toEqual(m);
    expect(assertSharedRoadSourceVersion(m!)).toBe(true);
    return m!;
  }

  it('A: authority CLOSED → bind WMC + consistency PASS', async () => {
    const m = await runWithAuthority({
      kind: 'RESOLVED',
      status: 'CLOSED',
      observedAt: new Date().toISOString(),
      sourceProvider: 'vegagerdin_gagnaveita',
      authority: 'OFFICIAL',
      evidenceId: 'ev_a',
      version: 'vA',
    });
    const world = bindLookRoadAuthorityIntoWorldModelContext(
      stubWorld('OPEN'),
      m,
    );
    expect(world.physical.roadStates.find((r) => r.roadId === 'F208')?.status).toBe(
      'CLOSED',
    );
    const report = evaluateDecisionTickConsistency(
      projectRoadBridgeToTickViews({ materialization: m, realityRoad: 'CLOSED' }),
    );
    expect(report.overall).toBe('PASS');
  });

  it('B: authority OPEN → Look must not seal CLOSED; WMC OPEN', async () => {
    const m = await runWithAuthority({
      kind: 'RESOLVED',
      status: 'OPEN',
      observedAt: new Date().toISOString(),
      sourceProvider: 'vegagerdin_gagnaveita',
      authority: 'OFFICIAL',
      evidenceId: 'ev_b',
      version: 'vB',
    });
    expect(m.lookHint.authoritative).toBe(false);
    const world = bindLookRoadAuthorityIntoWorldModelContext(
      stubWorld('CLOSED'),
      m,
    );
    expect(world.physical.roadStates.find((r) => r.roadId === 'F208')?.status).toBe(
      'OPEN',
    );
    const report = evaluateDecisionTickConsistency(
      projectRoadBridgeToTickViews({ materialization: m, realityRoad: 'OPEN' }),
    );
    expect(report.overall).toBe('PASS');
  });

  it('C: authority UNAVAILABLE → UNVERIFIED / NEED_CONFIRM / !treatAsOpenFact', async () => {
    const m = await runWithAuthority({
      kind: 'UNAVAILABLE',
      attemptedAt: new Date().toISOString(),
      reason: 'timeout',
      evidenceId: 'ev_c',
      version: 'vC',
    });
    expect(m.roadStatus).toBe('UNVERIFIED');
    expect(m.gateDisposition).toBe('NEED_CONFIRM');
    expect(m.cgusSees.treatAsOpenFact).toBe(false);
    const report = evaluateDecisionTickConsistency(
      projectRoadBridgeToTickViews({
        materialization: m,
        realityRoad: 'UNVERIFIED',
      }),
    );
    expect(report.overall).toBe('PASS');
  });

  it('no closed-sign facts → no trigger', async () => {
    const store = new DecisionTickRoadBindingStore();
    const svc = new LookRoadAuthorityDecisionTickService(
      store,
      mockPort({
        kind: 'RESOLVED',
        status: 'CLOSED',
        observedAt: new Date().toISOString(),
        sourceProvider: 'vegagerdin_gagnaveita',
        authority: 'OFFICIAL',
        evidenceId: 'ev',
        version: 'v',
      }) as never,
    );
    const m = await svc.maybeTriggerFromLookObservation({
      tripId: 'trip_prod',
      observationId: 'obs_2',
      facts: [
        {
          semanticType: 'OBSERVATION',
          semanticKey: 'OBSERVATION.ROAD.GRAVEL_SURFACE_DETECTED',
          value: true,
          confidence: 0.8,
          source: 'VISION',
        },
      ],
    });
    expect(m).toBeNull();
    expect(store.getLatest('trip_prod')).toBeUndefined();
  });
});
