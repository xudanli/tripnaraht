/**
 * Look finalize path → authority tick → Gate assertions (A/B/C).
 *
 * Uses real ObservationService + HeuristicExtraction (OCR seed) + tick service.
 */

import { HeuristicExtractionProvider } from '../../../trips/travel-observation/extraction/heuristic-extraction.provider';
import { ObservationExtractionService } from '../../../trips/travel-observation/extraction/observation-extraction.service';
import { ObservationGroundingService } from '../../../trips/travel-observation/grounding/observation-grounding.service';
import { LookDecisionProblemStore } from '../../../trips/travel-observation/assessment/look-decision-problem.store';
import { ObservationAssessmentBridgeService } from '../../../trips/travel-observation/assessment/observation-assessment.bridge.service';
import { ObservationRepository } from '../../../trips/travel-observation/observation.repository';
import { ObservationService } from '../../../trips/travel-observation/observation.service';
import { DecisionTickRoadBindingStore } from '../../../trips/decision/world-consistency/decision-tick-road-binding.store';
import { LookRoadAuthorityDecisionTickService } from '../../../trips/decision/world-consistency/look-road-authority-decision-tick.service';
import { DecisionTickRoadGateProvider } from '../../../trips/decision/world-consistency/decision-tick-road-gate.provider';
import { probeDecisionTickRoadConsumers } from '../../../trips/decision/world-consistency/probe-decision-tick-road-consumers.util';
import type { LookRoadAuthorityPort } from '../../../trips/decision/world-consistency/run-look-road-authority-decision-tick';
import type { AuthorityRoadResolveOutcome } from '../../../trips/decision/world-consistency/look-road-authority-bridge.types';

const TRIP = 'trip_look_finalize_probe';

function mockPort(outcome: AuthorityRoadResolveOutcome): LookRoadAuthorityPort {
  return { resolveAuthority: async () => outcome };
}

function makeLookStack(authority: AuthorityRoadResolveOutcome) {
  const bindingStore = new DecisionTickRoadBindingStore();
  const tickSvc = new LookRoadAuthorityDecisionTickService(
    bindingStore,
    mockPort(authority) as never,
  );
  const gate = new DecisionTickRoadGateProvider(bindingStore);
  const repo = new ObservationRepository();
  const extraction = new ObservationExtractionService(
    new HeuristicExtractionProvider(),
  );
  const grounding = new ObservationGroundingService();
  const bridge = new ObservationAssessmentBridgeService(
    new LookDecisionProblemStore(),
  );
  const observation = new ObservationService(
    repo,
    extraction,
    grounding,
    bridge,
    undefined,
    undefined,
    undefined,
    undefined,
    tickSvc,
  );
  return { observation, bindingStore, gate };
}

describe('Look finalize → Gate (P0-1)', () => {
  it('A: OCR closed sign + authority CLOSED → Gate BLOCK + binding PASS', async () => {
    const { observation, bindingStore, gate } = makeLookStack({
      kind: 'RESOLVED',
      status: 'CLOSED',
      observedAt: new Date().toISOString(),
      sourceProvider: 'vegagerdin_gagnaveita',
      authority: 'OFFICIAL',
      evidenceId: 'ev_fin_a',
      version: 'finA',
    });

    const event = await observation.create(TRIP, {
      intent: 'CHECK_ROAD',
      capturedAt: '2026-07-17T15:00:00.000Z',
      mediaRefs: ['media_1'],
      location: { latitude: 64.01, longitude: -19.1, accuracyMeters: 8 },
      ocrTextSeed: 'F208 ROAD CLOSED LOKAÐ',
    });
    expect(event.status).toBe('COMPLETED');

    const binding = bindingStore.getLatestBinding(TRIP);
    expect(binding).toBeDefined();
    expect(binding!.materialization.roadStatus).toBe('CLOSED');
    expect(binding!.materialization.lookHint.authoritative).toBe(false);

    const assertions = gate.evaluate({ tripId: TRIP });
    expect(assertions[0]?.status).toBe('BLOCK');
    expect(assertions[0]?.reasonCode).toBe('DECISION_TICK_ROAD_CLOSED');

    const probe = probeDecisionTickRoadConsumers(binding!);
    expect(probe.sourceVersionsEqual).toBe(true);
    expect(probe.cgusHardRoadViolationInjected).toBe(true);
  });

  it('B: Look closed OCR + authority OPEN → Gate PASS (no seal)', async () => {
    const { observation, bindingStore, gate } = makeLookStack({
      kind: 'RESOLVED',
      status: 'OPEN',
      observedAt: new Date().toISOString(),
      sourceProvider: 'vegagerdin_gagnaveita',
      authority: 'OFFICIAL',
      evidenceId: 'ev_fin_b',
      version: 'finB',
    });

    await observation.create(TRIP, {
      intent: 'CHECK_ROAD',
      capturedAt: '2026-07-17T15:05:00.000Z',
      mediaRefs: ['media_1'],
      location: { latitude: 64.01, longitude: -19.1 },
      ocrTextSeed: 'F208 ROAD CLOSED',
    });

    const binding = bindingStore.getLatestBinding(TRIP);
    expect(binding!.materialization.roadStatus).toBe('OPEN');
    const assertions = gate.evaluate({ tripId: TRIP });
    expect(assertions[0]?.status).toBe('PASS');
    expect(assertions[0]?.reasonCode).toBe('DECISION_TICK_ROAD_OPEN');
  });

  it('C: authority UNAVAILABLE → Gate REQUIRES_VERIFICATION', async () => {
    const { observation, bindingStore, gate } = makeLookStack({
      kind: 'UNAVAILABLE',
      attemptedAt: new Date().toISOString(),
      reason: 'timeout',
      evidenceId: 'ev_fin_c',
      version: 'finC',
    });

    await observation.create(TRIP, {
      intent: 'CHECK_ROAD',
      capturedAt: '2026-07-17T15:10:00.000Z',
      mediaRefs: ['media_1'],
      location: { latitude: 64.01, longitude: -19.1 },
      ocrTextSeed: 'F208 ROAD CLOSED',
    });

    const binding = bindingStore.getLatestBinding(TRIP);
    expect(binding!.materialization.gateDisposition).toBe('NEED_CONFIRM');
    const assertions = gate.evaluate({ tripId: TRIP });
    expect(assertions[0]?.status).toBe('REQUIRES_VERIFICATION');
    expect(assertions[0]?.reasonCode).toBe('DECISION_TICK_ROAD_UNVERIFIED');
  });
});
