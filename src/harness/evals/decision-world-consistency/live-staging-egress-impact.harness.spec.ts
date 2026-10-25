/**
 * Staging / live egress Decision Impact shadow.
 *
 * Default (CI/devbox): Frankfurt collector REPLAY fixture → authority port → Impact.
 * Opt-in live: DECISION_WORLD_LIVE_SHADOW=1 (skips when DNS/egress unavailable).
 *
 * Run:
 *   npx jest src/harness/evals/decision-world-consistency/live-staging-egress-impact.harness.spec.ts
 *   DECISION_WORLD_LIVE_SHADOW=1 npx jest ...live-staging-egress-impact...
 */

import { DecisionTickRoadBindingStore } from '../../../trips/decision/world-consistency/decision-tick-road-binding.store';
import { LookRoadAuthorityDecisionTickService } from '../../../trips/decision/world-consistency/look-road-authority-decision-tick.service';
import { EvidenceResolverLookRoadAuthorityPort } from '../../../trips/decision/world-consistency/evidence-resolver-look-road-authority.port';
import { DecisionTickRoadGateProvider } from '../../../trips/decision/world-consistency/decision-tick-road-gate.provider';
import { RFC001_EVIDENCE_RESOLVER_VERSION } from '../../../trips/guardian-decision-core/config/rfc001-iceland.config';
import type { RoadStatus } from '../../../skills/world/services/road-status-realtime.service';
import {
  formatDecisionImpactReport,
  measureRoadClosedDecisionImpact,
} from './measure-decision-impact.util';
import {
  isDecisionWorldLiveShadowEnabled,
  probeLiveGagnaveita,
  roadStatusFromGagnaveitaReplayFixture,
} from './gagnaveita-egress.util';
import {
  parseGagnaveitaFaerdPayload,
  mapGagnaveitaPayloadToRoadStatus,
} from '../../../trips/guardian-decision-core/evidence/gagnaveita-collector-parse.util';
import { GAGNAVEITA_FAERD2017_URL } from '../../../trips/guardian-decision-core/evidence/gagnaveita-faerd.mapper';

const TRIP = 'trip_is_egress_shadow';
const ROAD = 'F208';

const lookFacts = [
  {
    semanticType: 'OBSERVATION' as const,
    semanticKey: 'OBSERVATION.ROAD.CLOSED_SIGN_DETECTED',
    value: ROAD,
    confidence: 0.92,
    source: 'OCR' as const,
  },
];

function makeRoadStack(getRoadStatus: () => Promise<RoadStatus | null>) {
  const store = new DecisionTickRoadBindingStore();
  const evidenceResolver = {
    resolveFromRoadStatusSnapshot: jest.fn(
      async (_tripId: string, rs: RoadStatus) => ({
        assertion: {
          assertionId: `as_egress_${rs.roadId}_${rs.currentStatus}`,
          observedAt: rs.lastVerifiedAt.toISOString(),
          source: {
            evidenceRefs: [`ev_egress_${rs.roadId}_${rs.currentStatus}`],
          },
        },
        resolverVersion: RFC001_EVIDENCE_RESOLVER_VERSION,
      }),
    ),
  };
  const roadRealtime = { getRoadStatus: jest.fn(getRoadStatus) };
  const port = new EvidenceResolverLookRoadAuthorityPort(
    evidenceResolver as never,
    roadRealtime as never,
  );
  const svc = new LookRoadAuthorityDecisionTickService(store, port);
  const gate = new DecisionTickRoadGateProvider(store);
  return { store, svc, gate, roadRealtime };
}

describe('Staging egress Impact (Frankfurt collector replay)', () => {
  it('CLOSED replay fixture → Gate BLOCK + CGUS infeasible + Impact YES', async () => {
    const { roadStatus, fixture } = roadStatusFromGagnaveitaReplayFixture({
      freshObservedAt: true,
    });
    expect(fixture.fixtureMeta.replayScenario).toBe('CLOSED');
    expect(fixture.fixtureMeta.egressRegion).toBe('de-frankfurt');
    expect(roadStatus.currentStatus).toBe('closed');
    expect(roadStatus.dataSource).toBe('vegagerdin_gagnaveita');

    const { store, svc, gate } = makeRoadStack(async () => roadStatus);
    await svc.maybeTriggerFromLookObservation({
      tripId: TRIP,
      observationId: 'obs_egress_replay',
      facts: lookFacts,
      tickId: 'tick_egress_replay',
    });

    const binding = store.getLatestBinding(TRIP)!;
    expect(binding.materialization.roadStatus).toBe('CLOSED');
    expect(binding.materialization.sourceVersion.source).toContain(
      'gagnaveita',
    );
    expect(gate.evaluate({ tripId: TRIP })[0]?.status).toBe('BLOCK');

    const report = measureRoadClosedDecisionImpact({ binding });
    // eslint-disable-next-line no-console
    console.log(
      [
        '=== STAGING EGRESS REPLAY IMPACT ===',
        `fixture=${fixture.fixtureMeta.fixtureId}`,
        `egress=${fixture.fixtureMeta.egressHost} (${fixture.fixtureMeta.egressRegion})`,
        `fetchedAt=${fixture.fixtureMeta.fetchedAt}`,
        ...formatDecisionImpactReport(report),
        `sourceVersion=${JSON.stringify(binding.materialization.sourceVersion)}`,
      ].join('\n'),
    );

    expect(report.decisionWouldDifferIfBridgeDeleted).toBe(true);
    expect(report.withBridge.cgusFeasible).toBe(false);
  });
});

describe('Live Gagnaveita egress Impact (opt-in)', () => {
  const live = isDecisionWorldLiveShadowEnabled();

  (live ? it : it.skip)(
    'DECISION_WORLD_LIVE_SHADOW=1: probe + optional CLOSED Impact',
    async () => {
      const probe = await probeLiveGagnaveita();
      // eslint-disable-next-line no-console
      console.log(
        `=== LIVE GAGNAVEITA PROBE ===\n${JSON.stringify(probe, null, 2)}`,
      );

      if (!probe.ok) {
        // Soft-skip: egress not available from this host (expected on many devboxes)
        // eslint-disable-next-line no-console
        console.warn(
          `live Gagnaveita unavailable (${probe.reason}) — use Frankfurt collector / replay`,
        );
        return;
      }

      const res = await fetch(GAGNAVEITA_FAERD2017_URL);
      const text = await res.text();
      const records = parseGagnaveitaFaerdPayload(text);
      const mapped = mapGagnaveitaPayloadToRoadStatus(records, ROAD);
      expect(mapped).not.toBeNull();

      const roadStatus: RoadStatus = {
        ...mapped!,
        lastVerifiedAt: new Date(),
      };

      const { store, svc, gate } = makeRoadStack(async () => roadStatus);
      await svc.maybeTriggerFromLookObservation({
        tripId: `${TRIP}_live`,
        observationId: 'obs_egress_live',
        facts: lookFacts,
        tickId: 'tick_egress_live',
      });

      const binding = store.getLatestBinding(`${TRIP}_live`)!;
      const assertions = gate.evaluate({ tripId: `${TRIP}_live` });
      // eslint-disable-next-line no-console
      console.log(
        [
          '=== LIVE EGRESS TICK ===',
          `liveStatus=${roadStatus.currentStatus}`,
          `gate=${assertions[0]?.status}`,
          `road=${binding.materialization.roadStatus}`,
          `sourceVersion=${JSON.stringify(binding.materialization.sourceVersion)}`,
        ].join('\n'),
      );

      if (roadStatus.currentStatus === 'closed') {
        const report = measureRoadClosedDecisionImpact({ binding });
        expect(report.decisionWouldDifferIfBridgeDeleted).toBe(true);
      } else {
        // Live may be open/limited — still must not forge CLOSED from Look hint
        expect(binding.materialization.lookHint.authoritative).toBe(false);
        expect(binding.materialization.roadStatus).not.toBe('CLOSED');
      }
    },
    30_000,
  );

  it('documents probe failure mode when live flag off (dns often unresolvable)', async () => {
    const probe = await probeLiveGagnaveita({ timeoutMs: 5_000 });
    // eslint-disable-next-line no-console
    console.log(`live_probe_without_flag=${JSON.stringify(probe)}`);
    // Do not assert ok — environment-dependent; only that probe returns structured result
    expect(probe.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(typeof probe.ok).toBe('boolean');
  });
});
