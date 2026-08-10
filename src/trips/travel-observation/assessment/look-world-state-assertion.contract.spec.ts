import { LookWorldStateAssertionService } from './look-world-state-assertion.service';
import { InMemoryWorldStateStoreForLook } from './in-memory-world-state-store';
import {
  buildLookWorldStateAssertions,
  LOOK_FIELD_OBSERVATION_PREDICATE,
  projectLookFactToWorldStateAssertion,
} from './project-look-to-world-state';
import type { TravelObservationEvent } from '../observation.types';
import { HeuristicExtractionProvider } from '../extraction/heuristic-extraction.provider';
import { ObservationExtractionService } from '../extraction/observation-extraction.service';
import { ObservationGroundingService } from '../grounding/observation-grounding.service';
import { LookDecisionProblemStore } from './look-decision-problem.store';
import { ObservationAssessmentBridgeService } from './observation-assessment.bridge.service';
import { ObservationRepository } from '../observation.repository';
import { ObservationService } from '../observation.service';

function baseEvent(
  overrides: Partial<TravelObservationEvent> = {},
): TravelObservationEvent {
  return {
    observationId: 'obs_ws_1',
    tripId: 'trip_ws',
    dayIndex: 2,
    channel: 'LOOK_FIELD',
    source: 'IPHONE_CAMERA',
    intent: 'CHECK_ROAD',
    capturedAt: '2026-07-25T15:00:00Z',
    submittedAt: '2026-07-25T15:00:01Z',
    mediaRefs: ['media_f208'],
    captureRevision: 1,
    captureRevisions: [],
    spatialContext: { latitude: 64.01, longitude: -19.1, accuracyMeters: 8 },
    tripContext: {},
    observations: [
      {
        semanticType: 'OBSERVATION',
        semanticKey: 'OBSERVATION.ROAD.FROAD_SIGN_DETECTED',
        value: 'F208',
        confidence: 0.9,
        source: 'OCR',
      },
      {
        semanticType: 'RULE_TRIGGER',
        semanticKey: 'RULE_TRIGGER.FROAD_VEHICLE_MISMATCH',
        value: true,
        confidence: 0.95,
        source: 'ON_DEVICE',
      },
    ],
    verificationStatus: 'VERIFIED',
    privacy: {
      containsFace: false,
      containsPlate: false,
      containsDocument: false,
      redactionApplied: false,
      retentionPolicy: 'LOOK_MEDIA_SHORT_TERM_V1',
    },
    status: 'ASSESSING',
    ...overrides,
  };
}

describe('Look → WorldState assertion (Observation Channel)', () => {
  it('uses look.field_observation predicate with authoritative=false', () => {
    const assertions = buildLookWorldStateAssertions({
      event: baseEvent(),
      verificationStatus: 'VERIFIED',
      assessment: { assessmentId: 'a1', assessmentRevision: 1 },
    });
    expect(assertions.length).toBeGreaterThanOrEqual(2);
    for (const a of assertions) {
      expect(a.predicate).toBe(LOOK_FIELD_OBSERVATION_PREDICATE);
      expect(a.predicate).not.toBe('road.status');
      expect(a.payload.authoritative).toBe(false);
      expect(a.payload.channel).toBe('LOOK_FIELD');
      expect(a.source.sourceType).toBe('USER');
      expect(a.source.provider).toBe('NARA_LOOK');
    }
    expect(assertions[0]?.payload.relatedRoadId).toBe('F208');
  });

  it('refuses to project road.status fact', () => {
    expect(() =>
      projectLookFactToWorldStateAssertion({
        event: baseEvent(),
        fact: {
          semanticType: 'ROAD',
          semanticKey: 'road.status',
          value: 'CLOSED',
          confidence: 1,
          source: 'OCR',
        },
        verificationStatus: 'UNVERIFIED',
      }),
    ).toThrow(/never project road.status/);
  });

  it('persists assertions and returns snapshot id', async () => {
    const store = new InMemoryWorldStateStoreForLook();
    const svc = new LookWorldStateAssertionService(store as never);
    const result = await svc.projectFromObservation({
      event: baseEvent(),
      verificationStatus: 'VERIFIED',
      assessment: { assessmentId: 'a1', assessmentRevision: 1 },
    });
    expect(result.skipped).toBe(false);
    expect(result.assertionIds.length).toBeGreaterThanOrEqual(2);
    expect(result.snapshotId).toBeTruthy();

    const listed = await svc.listLookAssertions('trip_ws');
    expect(listed.every((a) => a.predicate === LOOK_FIELD_OBSERVATION_PREDICATE)).toBe(
      true,
    );
    expect(listed.some((a) => a.predicate === 'road.status')).toBe(false);
  });

  it('ObservationService projects Look facts into WorldState on complete', async () => {
    const store = new InMemoryWorldStateStoreForLook();
    const world = new LookWorldStateAssertionService(store as never);
    const service = new ObservationService(
      new ObservationRepository(),
      new ObservationExtractionService(new HeuristicExtractionProvider()),
      new ObservationGroundingService(),
      new ObservationAssessmentBridgeService(new LookDecisionProblemStore()),
      world,
    );

    const event = await service.create('trip_ws', {
      intent: 'CHECK_ROAD',
      capturedAt: '2026-07-25T15:00:00Z',
      mediaRefs: ['m1'],
      location: { latitude: 64.01, longitude: -19.1, accuracyMeters: 8 },
      ocrTextSeed: 'F208',
      groundingHints: {
        nearbyRoadIds: ['F208'],
        plannedRoadIds: ['F208'],
        plannedRequiresFroad: true,
        drivetrain: '2WD',
        vehicleClass: 'SEDAN',
        roadStatuses: {
          F208: {
            isOpen: true,
            updatedAt: '2026-07-25T12:00:00Z',
            source: 'road.is',
          },
        },
      },
    });

    const listed = await world.listLookAssertions('trip_ws');
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.every((a) => a.payload.observationId === event.observationId)).toBe(
      true,
    );
    expect(listed.every((a) => a.payload.authoritative === false)).toBe(true);
    const all = await store.readStore('trip_ws');
    expect(all.assertions.some((a) => a.predicate === 'road.status')).toBe(false);
  });
});
