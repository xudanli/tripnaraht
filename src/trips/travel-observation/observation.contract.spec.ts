import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import {
  canCapture,
  canConfirmApply,
  EXECUTION_BLOCK_FORBIDDEN_CTA,
  LOOK_ROLE_MATRIX,
} from './cta-and-roles';
import { HeuristicExtractionProvider } from './extraction/heuristic-extraction.provider';
import { ObservationExtractionService } from './extraction/observation-extraction.service';
import { ObservationGroundingService } from './grounding/observation-grounding.service';
import { LookDecisionProblemStore } from './assessment/look-decision-problem.store';
import { ObservationAssessmentBridgeService } from './assessment/observation-assessment.bridge.service';
import { computeMediaExpiresAt } from './media-retention';
import { ObservationRepository } from './observation.repository';
import { ObservationService } from './observation.service';
import {
  canTransition,
  isAssessmentReadable,
} from './observation-status.machine';
import { isFrozenSemanticKey } from './semantic-keys';

function makeService() {
  const repo = new ObservationRepository();
  const extraction = new ObservationExtractionService(
    new HeuristicExtractionProvider(),
  );
  const grounding = new ObservationGroundingService();
  const bridge = new ObservationAssessmentBridgeService(
    new LookDecisionProblemStore(),
  );
  return new ObservationService(repo, extraction, grounding, bridge);
}

describe('NARA Look S1+S2 contracts (OQ CLOSED 2026-07-25)', () => {
  let service: ObservationService;

  beforeEach(() => {
    service = makeService();
  });

  it('Q1: channel is LOOK_FIELD', async () => {
    const event = await service.create('trip_1', {
      intent: 'CHECK_ROAD',
      capturedAt: '2026-07-25T15:00:00Z',
      mediaRefs: ['media_1'],
      location: { latitude: 64.01, longitude: -19.1, accuracyMeters: 8 },
      ocrTextSeed: 'F208',
    });
    expect(event.channel).toBe('LOOK_FIELD');
  });

  it('Q2: assessment never writes PlanVersion and has no APPLY action', async () => {
    const event = await service.create('trip_1', {
      intent: 'CHECK_ROAD',
      capturedAt: '2026-07-25T15:00:00Z',
      mediaRefs: ['media_1'],
      location: { latitude: 64.01, longitude: -19.1 },
      ocrTextSeed: 'F208',
    });
    const assessment = service.getAssessment('trip_1', event.observationId);
    expect(assessment.writesPlanVersion).toBe(false);
    for (const forbidden of ['APPLY', 'EXECUTE', 'UPDATE_PLAN'] as const) {
      expect(
        assessment.actions.some((a) => (a as { type: string }).type === forbidden),
      ).toBe(false);
    }
  });

  it('Q4: media TTL is min(72h, tripEnd+24h)', () => {
    const capturedAt = '2026-07-25T00:00:00.000Z';
    expect(computeMediaExpiresAt(capturedAt, '2026-07-25T12:00:00.000Z')).toBe(
      '2026-07-26T12:00:00.000Z',
    );
    expect(computeMediaExpiresAt(capturedAt, '2026-08-01T00:00:00.000Z')).toBe(
      '2026-07-28T00:00:00.000Z',
    );
  });

  it('Q5: no GPS → INFO/NOTICE only, never EXECUTION_BLOCK / PREVIEW for road', async () => {
    const event = await service.create('trip_1', {
      intent: 'CHECK_ROAD',
      capturedAt: '2026-07-25T15:00:00Z',
      mediaRefs: ['media_1'],
      ocrTextSeed: 'F208',
    });
    const assessment = service.getAssessment('trip_1', event.observationId);
    expect(['INFO', 'NOTICE']).toContain(assessment.status);
    expect(assessment.status).not.toBe('EXECUTION_BLOCK');
    expect(assessment.actions.some((a) => a.type === 'PREVIEW')).toBe(false);
    expect(assessment.decisionProblem?.semanticKey).toBe(
      'DATA_UNCERTAINTY.GPS_INSUFFICIENT',
    );
  });

  it('Q5: closed sign without GPS is NOTICE not EXECUTION_BLOCK', async () => {
    const event = await service.create('trip_1', {
      intent: 'CHECK_ROAD',
      capturedAt: '2026-07-25T15:00:00Z',
      mediaRefs: ['media_1'],
      ocrTextSeed: 'ROAD CLOSED LOKAÐ',
    });
    const assessment = service.getAssessment('trip_1', event.observationId);
    expect(assessment.status).toBe('NOTICE');
    expect(assessment.status).not.toBe('EXECUTION_BLOCK');
  });

  it('Q6: assessment GET while EXTRACTING throws 409 body', async () => {
    const event = await service.create(
      'trip_1',
      {
        intent: 'CHECK_ROAD',
        capturedAt: '2026-07-25T15:00:00Z',
        mediaRefs: ['media_1'],
        location: { latitude: 64.01, longitude: -19.1 },
      },
      { syncMockComplete: false },
    );
    expect(event.status).toBe('EXTRACTING');
    expect(isAssessmentReadable(event.status)).toBe(false);
    expect(() => service.getAssessment('trip_1', event.observationId)).toThrow(
      ConflictException,
    );

    await service.completeMockPipeline(event.observationId);
    const assessment = service.getAssessment('trip_1', event.observationId);
    expect(assessment.assessmentRevision).toBe(1);
  });

  it('Q7: recapture keeps observationId and revisions', async () => {
    const event = await service.create('trip_1', {
      intent: 'CHECK_VEHICLE',
      capturedAt: '2026-07-25T15:00:00Z',
      mediaRefs: ['media_1'],
      location: { latitude: 64.01, longitude: -19.1 },
      ocrTextSeed: 'blurry side',
    });
    const id = event.observationId;
    const again = await service.appendMedia('trip_1', id, {
      mediaRefs: ['media_2'],
      reason: 'SYSTEM_RECAPTURE_REQUEST',
      ocrTextSeed: 'Toyota Yaris 2WD',
    });
    expect(again.observationId).toBe(id);
    expect(again.captureRevision).toBe(2);
    expect(
      again.observations.some(
        (o) => o.semanticKey === 'OBSERVATION.VEHICLE.MODEL_DETECTED',
      ),
    ).toBe(true);
    expect(service.listAssessmentRevisions(id)).toHaveLength(2);
  });

  it('S2: F208 with GPS yields FROAD fact and INFO (no formal BLOCK yet)', async () => {
    const event = await service.create('trip_1', {
      intent: 'CHECK_ROAD',
      capturedAt: '2026-07-25T15:00:00Z',
      mediaRefs: ['media_f208'],
      location: { latitude: 64.01, longitude: -19.1 },
      ocrTextSeed: 'F208',
    });
    expect(
      event.observations.some(
        (o) => o.semanticKey === 'OBSERVATION.ROAD.FROAD_SIGN_DETECTED',
      ),
    ).toBe(true);
    const assessment = service.getAssessment('trip_1', event.observationId);
    expect(assessment.status).not.toBe('EXECUTION_BLOCK');
    expect(assessment.writesPlanVersion).toBe(false);
    expect(assessment.summary.whatHappened).toMatch(/F-road|F208/i);
  });

  it('S3: F208 + 2WD + planned F-road + GPS → EXECUTION_BLOCK with Preview', async () => {
    const event = await service.create('trip_1', {
      intent: 'CHECK_ROAD',
      capturedAt: '2026-07-25T15:00:00Z',
      mediaRefs: ['media_f208'],
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
    expect(
      event.observations.some(
        (o) => o.semanticKey === 'RULE_TRIGGER.FROAD_VEHICLE_MISMATCH',
      ),
    ).toBe(true);
    const assessment = service.getAssessment('trip_1', event.observationId);
    expect(assessment.status).toBe('EXECUTION_BLOCK');
    expect(assessment.actions.some((a) => a.type === 'PREVIEW')).toBe(true);
    expect(assessment.writesPlanVersion).toBe(false);
    expect(assessment.verificationStatus).toBe('VERIFIED');
    expect(assessment.decisionProblem?.linkedDecisionProblemId).toBeTruthy();
    const preview = assessment.actions.find((a) => a.type === 'PREVIEW');
    // Q2: once DecisionProblem exists, CTA opens Decision detail
    expect(
      preview && preview.type === 'PREVIEW' && preview.previewRef,
    ).toMatch(/^decision:look_dp_/);
    const problem = service.getLinkedDecisionProblem(event.observationId);
    expect(problem?.constraintBridgeKey).toBe('OFFICIAL_IS_FROAD_2WD');
    expect(problem?.writesPlanVersion).toBe(false);
    expect(problem?.preview.corridor).toBe('DECISION');
    expect(problem?.semanticKey).toBe('RULE_TRIGGER.FROAD_VEHICLE_MISMATCH');
  });

  it('S3: F208 OCR + Reykjavik GPS → CONFLICTING, no EXECUTION_BLOCK', async () => {
    const event = await service.create('trip_1', {
      intent: 'CHECK_ROAD',
      capturedAt: '2026-07-25T15:00:00Z',
      mediaRefs: ['media_old'],
      location: { latitude: 64.14, longitude: -21.94, accuracyMeters: 12 },
      ocrTextSeed: 'F208',
    });
    expect(event.verificationStatus).toBe('CONFLICTING');
    const assessment = service.getAssessment('trip_1', event.observationId);
    expect(assessment.status).not.toBe('EXECUTION_BLOCK');
    expect(assessment.verificationStatus).toBe('CONFLICTING');
  });

  it('S2: MODEL_FAILED path returns 422 on assessment', async () => {
    const repo = new ObservationRepository();
    const badExtraction = {
      extract: async () =>
        ({
          ok: false,
          reason: 'SCHEMA_INVALID',
          errors: ['bad'],
          providerId: 'bad',
        }) as const,
    };
    const svc = new ObservationService(
      repo,
      badExtraction as unknown as ObservationExtractionService,
      new ObservationGroundingService(),
      new ObservationAssessmentBridgeService(new LookDecisionProblemStore()),
    );
    const event = await svc.create('trip_1', {
      intent: 'CHECK_ROAD',
      capturedAt: '2026-07-25T15:00:00Z',
      mediaRefs: ['m1'],
    });
    expect(event.status).toBe('MODEL_FAILED');
    expect(() => svc.getAssessment('trip_1', event.observationId)).toThrow(
      UnprocessableEntityException,
    );
  });

  it('Q8: Member/Advisor cannot Confirm Apply', () => {
    expect(LOOK_ROLE_MATRIX.MEMBER.confirmApply).toBe(false);
    expect(canCapture('ADVISOR')).toBe(false);
    expect(
      canConfirmApply({
        role: 'DRIVER',
        canConfirmExecutionChange: true,
        isActivelyDriving: true,
        proposalBlocked: false,
        previewConfirmsWriteAuthority: true,
      }),
    ).toBe(false);
    expect(EXECUTION_BLOCK_FORBIDDEN_CTA).toContain('继续');
  });

  it('status machine forbids skipping EXTRACTING → ASSESSING', () => {
    expect(canTransition('UPLOADING', 'ASSESSING')).toBe(false);
    expect(isFrozenSemanticKey('OBSERVATION.ROAD.FROAD_SIGN_DETECTED')).toBe(
      true,
    );
  });

  it('delete returns receipt', async () => {
    const event = await service.create('trip_1', {
      intent: 'CHECK_ROAD',
      capturedAt: '2026-07-25T15:00:00Z',
      mediaRefs: ['media_1'],
    });
    const receipt = service.delete('trip_1', event.observationId);
    expect(receipt.deleted.accessRevoked).toBe(true);
  });
});
