import {
  enforceAuthorityGate,
  resolveAssessmentAuthority,
} from './assessment-authority';
import { computeLookContextHash } from '../grounding/context-hash';
import { ObservationGroundingService } from '../grounding/observation-grounding.service';
import { HeuristicExtractionProvider } from '../extraction/heuristic-extraction.provider';
import { ObservationExtractionService } from '../extraction/observation-extraction.service';
import { LookDecisionProblemStore } from './look-decision-problem.store';
import { ObservationAssessmentBridgeService } from './observation-assessment.bridge.service';
import { ObservationRepository } from '../observation.repository';
import { ObservationService } from '../observation.service';

describe('AssessmentAuthority + contextHash (RealityOS / S4-BE-05)', () => {
  it('NO_GPS → VISUAL_ONLY', () => {
    const a = resolveAssessmentAuthority({
      hasGps: false,
      verificationStatus: 'INSUFFICIENT',
      status: 'INFO',
    });
    expect(a).toBe('VISUAL_ONLY');
  });

  it('F-road BLOCK with official corroboration → OFFICIAL_CORROBORATED', () => {
    const a = resolveAssessmentAuthority({
      hasGps: true,
      verificationStatus: 'VERIFIED',
      status: 'EXECUTION_BLOCK',
      grounding: {
        context: {} as never,
        verificationStatus: 'VERIFIED',
        facts: [],
        roadMatch: 'MATCHED',
        vehicleRoadFit: 'MISMATCH',
        meetingPoint: 'UNKNOWN',
        officialRoadOpen: true,
        roadStatusUpdatedAt: '2026-07-25T12:00:00Z',
        notes: [],
        contextHash: 'lch_x',
      },
    });
    expect(a).toBe('OFFICIAL_CORROBORATED');
  });

  it('enforces gate: VISUAL_ONLY cannot keep EXECUTION_BLOCK', () => {
    const gated = enforceAuthorityGate({
      status: 'EXECUTION_BLOCK',
      authority: 'VISUAL_ONLY',
    });
    expect(gated.status).toBe('NEED_CONFIRM');
    expect(gated.authority).toBe('VISUAL_ONLY');
  });

  it('contextHash is stable for same inputs and changes with drivetrain', () => {
    const event = {
      observationId: 'obs_h',
      tripId: 'trip_h',
      channel: 'LOOK_FIELD' as const,
      source: 'IPHONE_CAMERA' as const,
      intent: 'CHECK_ROAD' as const,
      capturedAt: '2026-07-25T15:00:00Z',
      submittedAt: '2026-07-25T15:00:01Z',
      mediaRefs: ['m1'],
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
          source: 'OCR' as const,
        },
      ],
      verificationStatus: 'UNVERIFIED' as const,
      privacy: {
        containsFace: false,
        containsPlate: false,
        containsDocument: false,
        redactionApplied: false,
        retentionPolicy: 'LOOK_MEDIA_SHORT_TERM_V1' as const,
      },
      status: 'GROUNDING' as const,
    };

    const groundingBase = {
      context: {} as never,
      verificationStatus: 'VERIFIED' as const,
      facts: [],
      roadMatch: 'MATCHED' as const,
      detectedRoadId: 'F208',
      vehicleRoadFit: 'MISMATCH' as const,
      meetingPoint: 'UNKNOWN' as const,
      officialRoadOpen: true,
      roadStatusUpdatedAt: '2026-07-25T12:00:00Z',
      notes: [],
      contextHash: '',
    };

    const h1 = computeLookContextHash({
      event,
      grounding: groundingBase,
      hints: { drivetrain: '2WD', plannedRequiresFroad: true },
    });
    const h2 = computeLookContextHash({
      event,
      grounding: groundingBase,
      hints: { drivetrain: '2WD', plannedRequiresFroad: true },
    });
    const h3 = computeLookContextHash({
      event,
      grounding: groundingBase,
      hints: { drivetrain: '4WD', plannedRequiresFroad: true },
    });
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
    expect(h1.startsWith('lch_')).toBe(true);
  });

  it('end-to-end assessment includes authority + contextHash', async () => {
    const service = new ObservationService(
      new ObservationRepository(),
      new ObservationExtractionService(new HeuristicExtractionProvider()),
      new ObservationGroundingService(),
      new ObservationAssessmentBridgeService(new LookDecisionProblemStore()),
    );

    const event = await service.create('trip_auth', {
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

    const assessment = service.getAssessment('trip_auth', event.observationId);
    expect(assessment.authority).toBe('OFFICIAL_CORROBORATED');
    expect(assessment.contextHash).toMatch(/^lch_[a-f0-9]{24}$/);
    expect(assessment.status).toBe('EXECUTION_BLOCK');
    expect(assessment.writesPlanVersion).toBe(false);
  });

  it('no GPS assessment is VISUAL_ONLY with contextHash', async () => {
    const service = new ObservationService(
      new ObservationRepository(),
      new ObservationExtractionService(new HeuristicExtractionProvider()),
      new ObservationGroundingService(),
      new ObservationAssessmentBridgeService(new LookDecisionProblemStore()),
    );
    const event = await service.create('trip_auth', {
      intent: 'CHECK_ROAD',
      capturedAt: '2026-07-25T15:00:00Z',
      mediaRefs: ['m1'],
      ocrTextSeed: 'F208',
    });
    const assessment = service.getAssessment('trip_auth', event.observationId);
    expect(assessment.authority).toBe('VISUAL_ONLY');
    expect(assessment.contextHash).toMatch(/^lch_/);
  });
});
