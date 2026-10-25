/**
 * EvidenceResolverLookRoadAuthorityPort — Gagnaveita-shaped realtime stub.
 *
 * Look never seals status; port resolves via RoadStatusRealtime → EvidenceResolver.
 */

import { DecisionTickRoadBindingStore } from '../../../trips/decision/world-consistency/decision-tick-road-binding.store';
import { EvidenceResolverLookRoadAuthorityPort } from '../../../trips/decision/world-consistency/evidence-resolver-look-road-authority.port';
import { LookRoadAuthorityDecisionTickService } from '../../../trips/decision/world-consistency/look-road-authority-decision-tick.service';
import {
  assertSharedRoadSourceVersion,
} from '../../../trips/decision/world-consistency/look-road-authority-bridge';
import { probeDecisionTickRoadConsumers } from '../../../trips/decision/world-consistency/probe-decision-tick-road-consumers.util';
import type { RoadStatus } from '../../../skills/world/services/road-status-realtime.service';
import { RFC001_EVIDENCE_RESOLVER_VERSION } from '../../../trips/guardian-decision-core/config/rfc001-iceland.config';

const TRIP = 'trip_gagna_port';
const ROAD = 'F208';

const lookFacts = [
  {
    semanticType: 'OBSERVATION' as const,
    semanticKey: 'OBSERVATION.ROAD.CLOSED_SIGN_DETECTED',
    value: ROAD,
    confidence: 0.9,
    source: 'OCR' as const,
  },
];

function stubRoadStatus(
  currentStatus: RoadStatus['currentStatus'],
): RoadStatus {
  return {
    roadId: ROAD,
    roadName: 'Fjallabaksleið nyrðri',
    currentStatus,
    lastVerifiedAt: new Date(),
    dataSource: 'vegagerdin_gagnaveita',
    hazards: [],
    confidence: 0.95,
    seasonalFallback: false,
  };
}

function makePort(opts: {
  getRoadStatus: () => Promise<RoadStatus | null>;
}) {
  const evidenceResolver = {
    resolveFromRoadStatusSnapshot: jest.fn(
      async (_tripId: string, rs: RoadStatus) => ({
        assertion: {
          assertionId: `as_${rs.roadId}_${rs.currentStatus}`,
          observedAt: rs.lastVerifiedAt.toISOString(),
          source: {
            evidenceRefs: [
              `ev_gagna_${rs.roadId}_${rs.currentStatus}`,
            ],
          },
        },
        resolverVersion: RFC001_EVIDENCE_RESOLVER_VERSION,
      }),
    ),
  };
  const roadStatusRealtime = {
    getRoadStatus: jest.fn(opts.getRoadStatus),
  };
  return new EvidenceResolverLookRoadAuthorityPort(
    evidenceResolver as never,
    roadStatusRealtime as never,
  );
}

describe('EvidenceResolverLookRoadAuthorityPort (Gagnaveita-shaped)', () => {
  it('A: realtime closed → CLOSED + shared sourceVersion + CGUS HARD', async () => {
    const store = new DecisionTickRoadBindingStore();
    const port = makePort({
      getRoadStatus: async () => stubRoadStatus('closed'),
    });
    const svc = new LookRoadAuthorityDecisionTickService(store, port);

    const m = await svc.maybeTriggerFromLookObservation({
      tripId: TRIP,
      observationId: 'obs_gagna_a',
      facts: lookFacts,
      tickId: 'tick_gagna_a',
    });

    expect(m).not.toBeNull();
    expect(m!.roadStatus).toBe('CLOSED');
    expect(m!.gateDisposition).toBe('BLOCK_CLOSED');
    expect(m!.sourceVersion.source).toContain('gagnaveita');
    expect(assertSharedRoadSourceVersion(m!)).toBe(true);

    const probe = probeDecisionTickRoadConsumers(store.getLatestBinding(TRIP)!);
    expect(probe.sourceVersionsEqual).toBe(true);
    expect(probe.cgusHardRoadViolationInjected).toBe(true);
  });

  it('B: realtime open → OPEN (Look hint does not seal CLOSED)', async () => {
    const store = new DecisionTickRoadBindingStore();
    const port = makePort({
      getRoadStatus: async () => stubRoadStatus('open'),
    });
    const svc = new LookRoadAuthorityDecisionTickService(store, port);

    const m = await svc.maybeTriggerFromLookObservation({
      tripId: TRIP,
      observationId: 'obs_gagna_b',
      facts: lookFacts,
      tickId: 'tick_gagna_b',
    });

    expect(m!.roadStatus).toBe('OPEN');
    expect(m!.gateDisposition).toBe('ALLOW_OPEN');
    expect(m!.lookHint.authoritative).toBe(false);
    expect(assertSharedRoadSourceVersion(m!)).toBe(true);
  });

  it('C: realtime null → UNAVAILABLE → UNVERIFIED / NEED_CONFIRM (no forge)', async () => {
    const store = new DecisionTickRoadBindingStore();
    const port = makePort({
      getRoadStatus: async () => null,
    });
    const svc = new LookRoadAuthorityDecisionTickService(store, port);

    const m = await svc.maybeTriggerFromLookObservation({
      tripId: TRIP,
      observationId: 'obs_gagna_c',
      facts: lookFacts,
      tickId: 'tick_gagna_c',
    });

    expect(m!.roadStatus).toBe('UNVERIFIED');
    expect(m!.gateDisposition).toBe('NEED_CONFIRM');
    expect(m!.authority.kind).toBe('UNAVAILABLE');
    expect(assertSharedRoadSourceVersion(m!)).toBe(true);
  });

  it('C2: missing RoadStatusRealtimeService → UNAVAILABLE', async () => {
    const store = new DecisionTickRoadBindingStore();
    const evidenceResolver = {
      resolveFromRoadStatusSnapshot: jest.fn(),
    };
    const port = new EvidenceResolverLookRoadAuthorityPort(
      evidenceResolver as never,
      undefined,
    );
    const svc = new LookRoadAuthorityDecisionTickService(store, port);

    const m = await svc.maybeTriggerFromLookObservation({
      tripId: TRIP,
      observationId: 'obs_gagna_c2',
      facts: lookFacts,
      tickId: 'tick_gagna_c2',
    });

    expect(m!.authority.kind).toBe('UNAVAILABLE');
    expect(m!.roadStatus).toBe('UNVERIFIED');
    expect(evidenceResolver.resolveFromRoadStatusSnapshot).not.toHaveBeenCalled();
  });
});
