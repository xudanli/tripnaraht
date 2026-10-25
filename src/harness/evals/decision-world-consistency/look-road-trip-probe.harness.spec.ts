/**
 * Real-Trip-shaped probe: Look CLOSED hint → authority → binding store →
 * ConstraintStore + WMC + CGUS inject + sourceVersion equality.
 *
 * Run:
 *   npx jest src/harness/evals/decision-world-consistency/look-road-trip-probe.harness.spec.ts
 */

import { DecisionTickRoadBindingStore } from '../../../trips/decision/world-consistency/decision-tick-road-binding.store';
import { LookRoadAuthorityDecisionTickService } from '../../../trips/decision/world-consistency/look-road-authority-decision-tick.service';
import { bindLookRoadAuthorityIntoWorldModelContext } from '../../../trips/decision/world-consistency/bind-look-road-into-world-model-context.util';
import {
  formatRoadConsumerProbeTable,
  probeDecisionTickRoadConsumers,
} from '../../../trips/decision/world-consistency/probe-decision-tick-road-consumers.util';
import type { LookRoadAuthorityPort } from '../../../trips/decision/world-consistency/run-look-road-authority-decision-tick';
import type { AuthorityRoadResolveOutcome } from '../../../trips/decision/world-consistency/look-road-authority-bridge.types';
import type { WorldModelContext } from '../../../trips/decision/shared/world-model.types';

const TRIP_ID = 'trip_is_south_coast_probe';
const ROAD = 'F208';

const lookFacts = [
  {
    semanticType: 'OBSERVATION' as const,
    semanticKey: 'OBSERVATION.ROAD.CLOSED_SIGN_DETECTED',
    value: ROAD,
    confidence: 0.92,
    source: 'OCR' as const,
  },
  {
    semanticType: 'OBSERVATION' as const,
    semanticKey: 'OBSERVATION.ROAD.FROAD_SIGN_DETECTED',
    value: ROAD,
    confidence: 0.95,
    source: 'OCR' as const,
  },
];

function stubWorldOpen(): WorldModelContext {
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
      roadStates: [{ roadId: ROAD, status: 'OPEN' }],
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
      name: 'South Coast',
    } as WorldModelContext['routeDirection'],
  };
}

async function runProbe(authority: AuthorityRoadResolveOutcome) {
  const store = new DecisionTickRoadBindingStore();
  const port: LookRoadAuthorityPort = {
    resolveAuthority: async () => authority,
  };
  const svc = new LookRoadAuthorityDecisionTickService(store, port as never);
  const m = await svc.maybeTriggerFromLookObservation({
    tripId: TRIP_ID,
    observationId: `obs_${authority.kind}`,
    facts: lookFacts,
    tickId: `probe_${authority.kind}_${'status' in authority ? authority.status : 'UA'}`,
  });
  expect(m).not.toBeNull();

  const binding = store.getLatestBinding(TRIP_ID);
  expect(binding).toBeDefined();

  const world = bindLookRoadAuthorityIntoWorldModelContext(
    stubWorldOpen(),
    m!,
  );
  const probe = probeDecisionTickRoadConsumers(binding!);
  const table = formatRoadConsumerProbeTable(probe);
  // eslint-disable-next-line no-console
  console.log(table.join('\n'));
  // eslint-disable-next-line no-console
  console.log(
    `sourceVersion abu=cgus=gate → ${probe.sourceVersionsEqual ? 'YES' : 'NO'} evidenceId=${probe.abuSourceVersion.evidenceId}`,
  );

  return { m: m!, world, probe, binding: binding! };
}

describe('Look road Trip probe (same-tick consumers)', () => {
  it('A official CLOSED: ConstraintStore + WMC + CGUS inject + versions equal', async () => {
    const { world, probe } = await runProbe({
      kind: 'RESOLVED',
      status: 'CLOSED',
      observedAt: new Date().toISOString(),
      sourceProvider: 'vegagerdin_gagnaveita',
      authority: 'OFFICIAL',
      evidenceId: 'ev_probe_closed',
      version: 'resolver@probeA',
    });

    expect(world.physical.roadStates[0]?.status).toBe('CLOSED');
    expect(probe.constraint).toBe('CLOSED');
    expect(probe.sourceVersionsEqual).toBe(true);
    expect(probe.cgusHardRoadViolationInjected).toBe(true);
    expect(probe.lookAuthoritative).toBe(false);
    expect(probe.lookPredicate).toBe('look.field_observation');
    expect(formatRoadConsumerProbeTable(probe)[1]).toContain('PASS');
  });

  it('B Look misreport + official OPEN: must not seal CLOSED', async () => {
    const { world, probe } = await runProbe({
      kind: 'RESOLVED',
      status: 'OPEN',
      observedAt: new Date().toISOString(),
      sourceProvider: 'vegagerdin_gagnaveita',
      authority: 'OFFICIAL',
      evidenceId: 'ev_probe_open',
      version: 'resolver@probeB',
    });

    expect(world.physical.roadStates[0]?.status).toBe('OPEN');
    expect(probe.constraint).toBe('OPEN');
    expect(probe.cgusHardRoadViolationInjected).toBe(false);
    expect(probe.sourceVersionsEqual).toBe(true);
    expect(formatRoadConsumerProbeTable(probe)[1]).toContain('PASS');
  });

  it('C authority UNAVAILABLE: UNVERIFIED / NEED_CONFIRM / versions equal', async () => {
    const { probe } = await runProbe({
      kind: 'UNAVAILABLE',
      attemptedAt: new Date().toISOString(),
      reason: 'gagnaveita_timeout',
      evidenceId: 'ev_probe_ua',
      version: 'resolver@probeC',
    });

    expect(probe.reality).toBe('UNVERIFIED');
    expect(probe.gateDisposition).toBe('NEED_CONFIRM');
    expect(probe.cgusTreatAsOpenFact).toBe(false);
    expect(probe.sourceVersionsEqual).toBe(true);
    // ConstraintStore uses DEGRADED for unverified — not OPEN/CLOSED forge
    expect(probe.constraint).not.toBe('CLOSED');
    expect(probe.constraint).not.toBe('OPEN');
    expect(formatRoadConsumerProbeTable(probe)[1]).toContain('PASS');
  });
});
