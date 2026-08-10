import { ConflictException, NotFoundException } from '@nestjs/common';
import { HeuristicExtractionProvider } from '../extraction/heuristic-extraction.provider';
import { ObservationExtractionService } from '../extraction/observation-extraction.service';
import { LookFeedbackStore } from '../feedback/look-feedback.store';
import { ObservationGroundingService } from '../grounding/observation-grounding.service';
import { ObservationRepository } from '../observation.repository';
import { ObservationService } from '../observation.service';
import { LookDecisionProblemStore } from './look-decision-problem.store';
import { ObservationAssessmentBridgeService } from './observation-assessment.bridge.service';

function makeService() {
  return new ObservationService(
    new ObservationRepository(),
    new ObservationExtractionService(new HeuristicExtractionProvider()),
    new ObservationGroundingService(),
    new ObservationAssessmentBridgeService(new LookDecisionProblemStore()),
    undefined,
    undefined,
    new LookFeedbackStore(),
  );
}

describe('S9 context patch + feedback (RealityOS §16.5 / §16.7)', () => {
  it('PATCH context with GPS reassess → leaves NO_GPS road path', async () => {
    const service = makeService();
    const event = await service.create('trip_ctx', {
      intent: 'CHECK_ROAD',
      capturedAt: '2026-07-26T12:00:00Z',
      mediaRefs: ['m1'],
      ocrTextSeed: 'F208',
    });
    const before = service.getAssessment('trip_ctx', event.observationId);
    expect(before.decisionProblem?.semanticKey).toBe(
      'DATA_UNCERTAINTY.GPS_INSUFFICIENT',
    );

    const patched = await service.patchContext('trip_ctx', event.observationId, {
      location: { latitude: 64.01, longitude: -19.1, accuracyMeters: 8 },
      groundingHints: {
        nearbyRoadIds: ['F208'],
        plannedRoadIds: ['F208'],
        plannedRequiresFroad: true,
        drivetrain: '2WD',
        vehicleClass: 'SEDAN',
        roadStatuses: {
          F208: {
            isOpen: true,
            updatedAt: '2026-07-26T10:00:00Z',
            source: 'road.is',
          },
        },
      },
    });

    expect(patched.writesPlanVersion).toBe(false);
    expect(patched.reassessed).toBe(true);
    expect(patched.analyticsEvent).toBe('look_context_corrected');
    expect(patched.contextHash).toMatch(/^lch_/);

    const after = service.getAssessment('trip_ctx', event.observationId);
    expect(after.assessmentRevision).toBeGreaterThan(before.assessmentRevision);
    expect(after.status).toBe('EXECUTION_BLOCK');
    expect(after.writesPlanVersion).toBe(false);
  });

  it('PATCH with reassess:false merges without new assessment revision', async () => {
    const service = makeService();
    const event = await service.create('trip_ctx', {
      intent: 'CHECK_ROAD',
      capturedAt: '2026-07-26T12:00:00Z',
      mediaRefs: ['m1'],
      location: { latitude: 64.14, longitude: -21.9 },
      ocrTextSeed: 'Reykjavik street',
    });
    const before = service.getAssessment('trip_ctx', event.observationId);
    const patched = await service.patchContext('trip_ctx', event.observationId, {
      dayIndex: 3,
      tripContext: { bookingId: 'bk_x' },
      reassess: false,
    });
    expect(patched.reassessed).toBe(false);
    const after = service.getAssessment('trip_ctx', event.observationId);
    expect(after.assessmentRevision).toBe(before.assessmentRevision);
  });

  it('POST feedback HELPFUL → receipt; never PlanVersion', async () => {
    const service = makeService();
    const event = await service.create('trip_fb', {
      intent: 'CHECK_PARKING',
      capturedAt: '2026-07-26T12:00:00Z',
      mediaRefs: ['m_park'],
      location: { latitude: 64.14, longitude: -21.94 },
      ocrTextSeed: 'Paid parking until 18:00',
    });
    const assessment = service.getAssessment('trip_fb', event.observationId);
    const receipt = service.submitFeedback('trip_fb', event.observationId, {
      assessmentId: assessment.assessmentId,
      assessmentRevision: assessment.assessmentRevision,
      result: 'HELPFUL',
      userCorrection: {
        actualKind: 'PARKING_SIGN',
        actualOutcome: 'PROVIDER_CONFIRMED',
      },
    });
    expect(receipt.feedbackId).toMatch(/^fb_/);
    expect(receipt.writesPlanVersion).toBe(false);
    expect(receipt.analyticsEvent).toBe('look_feedback_submitted');
    expect(receipt.result).toBe('HELPFUL');
  });

  it('feedback on unknown assessmentId → 404', async () => {
    const service = makeService();
    const event = await service.create('trip_fb', {
      intent: 'CHECK_ROAD',
      capturedAt: '2026-07-26T12:00:00Z',
      mediaRefs: ['m1'],
      ocrTextSeed: 'F208',
    });
    expect(() =>
      service.submitFeedback('trip_fb', event.observationId, {
        assessmentId: 'assess_missing',
        result: 'WRONG',
      }),
    ).toThrow(NotFoundException);
  });

  it('feedback before COMPLETED → Conflict', async () => {
    const service = makeService();
    const event = await service.create(
      'trip_fb',
      {
        intent: 'CHECK_ROAD',
        capturedAt: '2026-07-26T12:00:00Z',
        mediaRefs: ['m1'],
        ocrTextSeed: 'F208',
      },
      { syncMockComplete: false },
    );
    expect(() =>
      service.submitFeedback('trip_fb', event.observationId, {
        assessmentId: 'assess_any',
        result: 'HELPFUL',
      }),
    ).toThrow(ConflictException);
  });
});
