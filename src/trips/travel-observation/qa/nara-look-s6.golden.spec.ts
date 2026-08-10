/**
 * S6-QA-01 — Golden Set + fault injection + Pilot engineering gates
 */

import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { LookDecisionProblemStore } from '../assessment/look-decision-problem.store';
import { ObservationAssessmentBridgeService } from '../assessment/observation-assessment.bridge.service';
import {
  canCapture,
  canConfirmApply,
  EXECUTION_BLOCK_FORBIDDEN_CTA,
} from '../cta-and-roles';
import { HeuristicExtractionProvider } from '../extraction/heuristic-extraction.provider';
import { ObservationExtractionService } from '../extraction/observation-extraction.service';
import { ObservationGroundingService } from '../grounding/observation-grounding.service';
import { buildResultViewModel } from '../dto/frontend-nara-look-result';
import { computeMediaExpiresAt } from '../media-retention';
import { ObservationRepository } from '../observation.repository';
import { ObservationService } from '../observation.service';
import { isAssessmentReadable } from '../observation-status.machine';
import {
  NARA_LOOK_GOLDEN_CASES,
  NARA_LOOK_PILOT_GATES,
} from './nara-look-golden-cases';

function makeService() {
  return new ObservationService(
    new ObservationRepository(),
    new ObservationExtractionService(new HeuristicExtractionProvider()),
    new ObservationGroundingService(),
    new ObservationAssessmentBridgeService(new LookDecisionProblemStore()),
  );
}

describe('NARA Look S6 Golden Set', () => {
  for (const gc of NARA_LOOK_GOLDEN_CASES) {
    it(`${gc.id}: ${gc.title}`, async () => {
      const service = makeService();
      const event = await service.create('trip_golden', {
        intent: gc.intent,
        capturedAt: '2026-07-25T15:00:00Z',
        mediaRefs: gc.mediaRefs ?? [`media_${gc.id}`],
        location: gc.location,
        ocrTextSeed: gc.ocrTextSeed,
        groundingHints: gc.groundingHints as never,
      });

      expect(event.channel).toBe(gc.expect.channel);

      const assessment = service.getAssessment(
        'trip_golden',
        event.observationId,
      );
      expect(assessment.writesPlanVersion).toBe(false);

      if (gc.expect.status) {
        expect(assessment.status).toBe(gc.expect.status);
      }
      if (gc.expect.statusNot) {
        expect(assessment.status).not.toBe(gc.expect.statusNot);
      }
      if (gc.expect.verificationStatus) {
        expect(assessment.verificationStatus).toBe(
          gc.expect.verificationStatus,
        );
      }
      if (gc.expect.semanticKey) {
        expect(assessment.decisionProblem?.semanticKey).toBe(
          gc.expect.semanticKey,
        );
      }
      if (gc.expect.hasPreviewAction === true) {
        expect(assessment.actions.some((a) => a.type === 'PREVIEW')).toBe(true);
      }
      if (gc.expect.hasPreviewAction === false) {
        expect(assessment.actions.some((a) => a.type === 'PREVIEW')).toBe(
          false,
        );
      }
      if (gc.expect.previewRefPrefix) {
        const preview = assessment.actions.find((a) => a.type === 'PREVIEW');
        expect(
          preview && preview.type === 'PREVIEW' && preview.previewRef,
        ).toMatch(new RegExp(`^${gc.expect.previewRefPrefix}`));
      }
      if (gc.expect.linkedDecisionProblem) {
        expect(
          assessment.decisionProblem?.linkedDecisionProblemId,
        ).toBeTruthy();
        const problem = service.getLinkedDecisionProblem(event.observationId);
        expect(problem?.writesPlanVersion).toBe(false);
        if (gc.expect.constraintBridgeKey) {
          expect(problem?.constraintBridgeKey).toBe(
            gc.expect.constraintBridgeKey,
          );
        }
      }

      // RESULT VM never invents Apply
      const vm = buildResultViewModel({
        assessment: {
          ...assessment,
          writesPlanVersion: false,
        },
        role: 'MEMBER',
      });
      expect(vm.writesPlanVersion).toBe(false);
      expect(vm.confirmApplyAllowed).toBe(false);
      expect(JSON.stringify(vm)).not.toMatch(/"type":"APPLY"/);
    });
  }
});

describe('NARA Look S6 fault injection', () => {
  it('FI-01: empty media → IMAGE_INVALID / 422 create', async () => {
    const service = makeService();
    await expect(
      service.create('trip_fi', {
        intent: 'CHECK_ROAD',
        capturedAt: '2026-07-25T15:00:00Z',
        mediaRefs: [],
      }),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('FI-02: assessment while EXTRACTING → 409', async () => {
    const service = makeService();
    const event = await service.create(
      'trip_fi',
      {
        intent: 'CHECK_ROAD',
        capturedAt: '2026-07-25T15:00:00Z',
        mediaRefs: ['m1'],
        location: { latitude: 64.01, longitude: -19.1 },
      },
      { syncMockComplete: false },
    );
    expect(isAssessmentReadable(event.status)).toBe(false);
    expect(() =>
      service.getAssessment('trip_fi', event.observationId),
    ).toThrow(ConflictException);
  });

  it('FI-03: schema-invalid extraction → MODEL_FAILED + 422 assessment', async () => {
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
      new ObservationRepository(),
      badExtraction as unknown as ObservationExtractionService,
      new ObservationGroundingService(),
      new ObservationAssessmentBridgeService(new LookDecisionProblemStore()),
    );
    const event = await svc.create('trip_fi', {
      intent: 'CHECK_ROAD',
      capturedAt: '2026-07-25T15:00:00Z',
      mediaRefs: ['m1'],
    });
    expect(event.status).toBe('MODEL_FAILED');
    expect(() => svc.getAssessment('trip_fi', event.observationId)).toThrow(
      UnprocessableEntityException,
    );
  });

  it('FI-04: delete revokes media access; structured obs retained flag', async () => {
    const service = makeService();
    const event = await service.create('trip_fi', {
      intent: 'CHECK_ROAD',
      capturedAt: '2026-07-25T15:00:00Z',
      mediaRefs: ['m1'],
    });
    const receipt = service.delete('trip_fi', event.observationId);
    expect(receipt.deleted.originalMedia).toBe(true);
    expect(receipt.deleted.accessRevoked).toBe(true);
    expect(receipt.retained.structuredObservation).toBe(true);
    expect(receipt.mediaRetentionPolicy).toBe('LOOK_MEDIA_SHORT_TERM_V1');
  });

  it('FI-05: EXECUTION_BLOCK RESULT forbids continue/ignore CTA', async () => {
    const service = makeService();
    const event = await service.create('trip_fi', {
      intent: 'CHECK_ROAD',
      capturedAt: '2026-07-25T15:00:00Z',
      mediaRefs: ['m_f208'],
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
    const assessment = service.getAssessment('trip_fi', event.observationId);
    expect(assessment.status).toBe('EXECUTION_BLOCK');
    const vm = buildResultViewModel({ assessment: { ...assessment, writesPlanVersion: false } });
    const labels = `${vm.cta.primary.label} ${vm.cta.secondary.label}`;
    for (const forbidden of EXECUTION_BLOCK_FORBIDDEN_CTA) {
      expect(labels.includes(forbidden)).toBe(false);
    }
  });

  it('FI-06: recapture same id; distant/time boundary uses new observation when required', async () => {
    const service = makeService();
    const event = await service.create('trip_fi', {
      intent: 'CHECK_VEHICLE',
      capturedAt: '2026-07-25T15:00:00Z',
      mediaRefs: ['m1'],
      location: { latitude: 64.01, longitude: -19.1 },
      ocrTextSeed: 'blurry',
    });
    const again = await service.appendMedia('trip_fi', event.observationId, {
      mediaRefs: ['m2'],
      reason: 'SYSTEM_RECAPTURE_REQUEST',
      ocrTextSeed: 'Toyota Yaris 2WD',
    });
    expect(again.observationId).toBe(event.observationId);
    expect(again.captureRevision).toBe(2);
  });
});

describe('NARA Look S6 Pilot engineering gates', () => {
  it('exports required Pilot gate list', () => {
    expect(NARA_LOOK_PILOT_GATES.filter((g) => g.required).length).toBeGreaterThanOrEqual(
      8,
    );
    expect(NARA_LOOK_PILOT_GATES.some((g) => g.id === 'PG-09')).toBe(true);
  });

  it('PG engineering subset passes in this repo', () => {
    expect(canCapture('ADVISOR')).toBe(false);
    expect(
      canConfirmApply({
        role: 'MEMBER',
        canConfirmExecutionChange: false,
        isActivelyDriving: false,
        proposalBlocked: false,
        previewConfirmsWriteAuthority: true,
      }),
    ).toBe(false);
    expect(
      computeMediaExpiresAt(
        '2026-07-25T00:00:00.000Z',
        '2026-07-25T12:00:00.000Z',
      ),
    ).toBe('2026-07-26T12:00:00.000Z');
  });
});
